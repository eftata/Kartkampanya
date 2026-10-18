"use client";

import type { FeedbackStatus } from "@kartplan/shared";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { setFeedbackStatusAction } from "@/lib/feedback-actions";
import { FEEDBACK_STATUS_LABELS } from "@/lib/feedback-labels";

const STATUSES: FeedbackStatus[] = ["NEW", "READ", "DONE"];

/** Admin: geri bildirimin durumunu değiştirir (işlem kaydı sunucuda yazılır). */
export function FeedbackStatusButtons({ id, status }: { id: string; status: FeedbackStatus }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {STATUSES.filter((value) => value !== status).map((value) => (
        <Button
          key={value}
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => setError((await setFeedbackStatusAction(id, value)).error))
          }
        >
          {FEEDBACK_STATUS_LABELS[value]} olarak işaretle
        </Button>
      ))}
      {error && (
        <span role="alert" className="text-destructive text-xs">
          {error}
        </span>
      )}
    </div>
  );
}
