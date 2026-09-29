import PromPanel from './PromPanel.jsx';

// manishOps Kubernetes / Namespaces — mirrors the infra dashboard layout.
// Panels query Prometheus via the backend /api/prom proxy. They render an
// empty-state (with the PromQL) until a Prometheus datasource + exporters
// (kube-state-metrics, node-exporter, cAdvisor) are deployed. See monitoring/.
const NS = 'namespace!=""';

export default function KubernetesView() {
  return (
    <>
      <div className="view-note">Namespace resource usage · source: Prometheus</div>
      <div className="dashboard">
        <PromPanel
          title="CPU utilization (cores)" unit="cores" kind="area"
          query={`sum(rate(container_cpu_usage_seconds_total{${NS},container!=""}[5m])) by (namespace)`}
        />
        <PromPanel
          title="Memory usage" unit="bytes" kind="area"
          query={`sum(container_memory_working_set_bytes{${NS},container!=""}) by (namespace)`}
        />
        <PromPanel
          title="CPU utilization (from limits)" unit="%" kind="line"
          query={`100 * sum(rate(container_cpu_usage_seconds_total{${NS},container!=""}[5m])) by (namespace) / sum(kube_pod_container_resource_limits{${NS},resource="cpu"}) by (namespace)`}
        />
        <PromPanel
          title="Memory utilization (from requests)" unit="%" kind="line"
          query={`100 * sum(container_memory_working_set_bytes{${NS},container!=""}) by (namespace) / sum(kube_pod_container_resource_requests{${NS},resource="memory"}) by (namespace)`}
        />
        <PromPanel
          title="CPU utilization (from requests)" unit="%" kind="line"
          query={`100 * sum(rate(container_cpu_usage_seconds_total{${NS},container!=""}[5m])) by (namespace) / sum(kube_pod_container_resource_requests{${NS},resource="cpu"}) by (namespace)`}
        />
        <PromPanel
          title="Memory utilization (from limits)" unit="%" kind="line"
          query={`100 * sum(container_memory_working_set_bytes{${NS},container!=""}) by (namespace) / sum(kube_pod_container_resource_limits{${NS},resource="memory"}) by (namespace)`}
        />
        <PromPanel
          title="Storage: PVC usage" unit="%" kind="line"
          query={`100 * kubelet_volume_stats_used_bytes / kubelet_volume_stats_capacity_bytes`}
        />
        <PromPanel
          title="Pod restarts" unit="15m" kind="line"
          query={`sum(increase(kube_pod_container_status_restarts_total{${NS}}[15m])) by (namespace)`}
        />
        <PromPanel
          title="Running pods" unit="count" kind="area"
          query={`sum(kube_pod_status_phase{${NS},phase="Running"}) by (namespace)`}
        />
      </div>
    </>
  );
}
