import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type HabitReminder = {
  id: string;
  user_id: string;
  name: string;
  frequency: "daily" | "weekly";
  reminder_time: string;
  reminder_timezone: string;
  reminder_weekday: number | null;
};

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(values.weekday);
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
    weekday: weekday === 0 ? 7 : weekday
  };
}

Deno.serve(async request => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const cronSecret = Deno.env.get("REMINDER_CRON_SECRET");
  if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT");
  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    console.error("Habit reminder function is missing required secrets.");
    return new Response("Reminder service is not configured", { status: 500 });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: habits, error: habitsError } = await supabase
    .from("habits")
    .select("id,user_id,name,frequency,reminder_time,reminder_timezone,reminder_weekday")
    .eq("active", true)
    .not("reminder_time", "is", null);
  if (habitsError) {
    console.error("Could not read scheduled habits:", habitsError.message);
    return new Response("Could not read scheduled habits", { status: 500 });
  }

  let sent = 0;
  for (const habit of (habits || []) as HabitReminder[]) {
    try {
      const local = localParts(new Date(), habit.reminder_timezone || "UTC");
      if (local.time !== habit.reminder_time.slice(0, 5)) continue;
      if (habit.frequency === "weekly" && habit.reminder_weekday !== local.weekday) continue;

      const { data: claim, error: claimError } = await supabase
        .from("habit_reminder_deliveries")
        .insert({ habit_id: habit.id, reminder_date: local.date })
        .select("habit_id")
        .maybeSingle();
      if (claimError?.code === "23505") continue;
      if (claimError) {
        console.error(`Could not claim reminder for habit ${habit.id}:`, claimError.message);
        continue;
      }
      if (!claim) continue;

      const { data: subscriptions, error: subscriptionError } = await supabase
        .from("habit_push_subscriptions")
        .select("id,subscription")
        .eq("user_id", habit.user_id);
      if (subscriptionError) {
        console.error(`Could not load push subscriptions for user ${habit.user_id}:`, subscriptionError.message);
        continue;
      }

      for (const row of subscriptions || []) {
        try {
          await webpush.sendNotification(row.subscription, JSON.stringify({
            title: "LifeProof habit reminder",
            body: `It's time for: ${habit.name}`,
            url: "/habits"
          }));
          sent++;
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            const { error: deleteError } = await supabase
              .from("habit_push_subscriptions")
              .delete()
              .eq("id", row.id);
            if (deleteError) console.error("Could not remove expired push subscription:", deleteError.message);
          } else {
            console.error(`Could not send reminder for habit ${habit.id}:`, error);
          }
        }
      }
    } catch (error) {
      console.error(`Could not process reminder for habit ${habit.id}:`, error);
    }
  }

  return Response.json({ sent });
});
