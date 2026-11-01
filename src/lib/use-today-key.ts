import { useSyncExternalStore } from "react";
import { dateKeyInTimezone } from "@/lib/engine/dates";

const subscribeToClock = (onStoreChange: () => void) => {
  const timer = window.setInterval(onStoreChange, 60_000);
  return () => window.clearInterval(timer);
};

export function useTodayKey(timezone: string): string {
  return useSyncExternalStore(
    subscribeToClock,
    () => dateKeyInTimezone(new Date(), timezone),
    () => "",
  );
}
