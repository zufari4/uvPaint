import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useEditor } from "./hooks";
import { Button } from "./Button";
export function Notice() {
  const e = useEditor(),
    notice = e.notice;
  const [dismissed, setDismissed] = useState<number | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setDismissed(notice.id), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  if (!notice || dismissed === notice.id || e.error) return null;
  return (
    <div className="notice-toast" role="status">
      <span>{notice.text}</span>
      <Button
        title="Dismiss notification"
        onClick={() => setDismissed(notice.id)}
      >
        <X size={14} />
      </Button>
    </div>
  );
}
