import PromPanel from './PromPanel.jsx';

// Panels that work against the PUBLIC Prometheus demo
// (https://prometheus.demo.prometheus.io) — node/prometheus metrics that
// actually exist there, so charts populate without a K8s cluster. Set
// PROM_URL to the demo endpoint on the backend.
export default function DemoView() {
  return (
    <>
      <div className="view-note">Infrastructure metrics · source: Prometheus</div>
      <div className="dashboard">
        <PromPanel
          title="Node CPU busy" unit="%" kind="area"
          query={`100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)`}
        />
        <PromPanel
          title="Node memory used" unit="%" kind="area"
          query={`100 * (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)`}
        />
        <PromPanel
          title="Targets up" unit="up=1" kind="line"
          query={`up`}
        />
        <PromPanel
          title="Disk read" unit="B/s" kind="line"
          query={`rate(node_disk_read_bytes_total[5m])`}
        />
        <PromPanel
          title="Disk written" unit="B/s" kind="line"
          query={`rate(node_disk_written_bytes_total[5m])`}
        />
        <PromPanel
          title="Network received" unit="B/s" kind="line"
          query={`rate(node_network_receive_bytes_total{device!="lo"}[5m])`}
        />
        <PromPanel
          title="Prometheus HTTP req rate" unit="req/s" kind="area"
          query={`sum(rate(prometheus_http_requests_total[5m])) by (handler)`}
        />
        <PromPanel
          title="Filesystem used" unit="%" kind="line"
          query={`100 * (1 - node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes{fstype!~"tmpfs|overlay"})`}
        />
        <PromPanel
          title="Load average (1m)" unit="load" kind="line"
          query={`node_load1`}
        />
      </div>
    </>
  );
}
