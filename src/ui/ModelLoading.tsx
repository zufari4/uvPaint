import { LoaderCircle } from "lucide-react";
import { useEditor } from "./hooks";

export function ModelLoading() {
  const loading = useEditor().modelLoading;
  if (!loading) return null;
  return <div className="model-loading" role="status" aria-live="polite" aria-label="Loading GLB model">
    <div className="model-loading-card">
      <LoaderCircle className="model-loading-spinner" size={30} aria-hidden="true" />
      <strong>Loading GLB model</strong>
      <span className="model-loading-name" title={loading.name}>{loading.name}</span>
      <span>{loading.stage}</span>
      {loading.detail && <small>{loading.detail}</small>}
    </div>
  </div>;
}
