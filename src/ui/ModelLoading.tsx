import { LoaderCircle } from "lucide-react";
import { useEditor } from "./hooks";

export function ModelLoading() {
  const loading = useEditor().modelLoading;
  if (!loading) return null;
  const title = loading.title ?? "Loading GLB model";
  return <div className="model-loading" role="status" aria-live="polite" aria-label={title}>
    <div className="model-loading-card">
      <LoaderCircle className="model-loading-spinner" size={30} aria-hidden="true" />
      <strong>{title}</strong>
      <span className="model-loading-name" title={loading.name}>{loading.name}</span>
      <span>{loading.stage}</span>
      {loading.detail && <small>{loading.detail}</small>}
    </div>
  </div>;
}
