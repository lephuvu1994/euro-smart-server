import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Server, Users, Layers, Zap, Loader2 } from "lucide-react";
import { api } from "../services/api";

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalPartners: 0,
    totalDevices: 0,
    totalDeviceModels: 0,
    activeQuotas: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/dashboard/stats');
      const data = res.data?.data || res.data;
      if (data) setStats(data);
    } catch (error) {
      console.error('Failed to load dashboard stats', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto w-full">
      <h1 className="text-3xl font-bold tracking-tight mb-6 flex items-center gap-3">
        Dashboard
        {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
      </h1>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[
          { title: "Hardware Devices", icon: Server, value: stats.totalDevices },
          { title: "B2B Partners", icon: Users, value: stats.totalPartners },
          { title: "Device Models", icon: Layers, value: stats.totalDeviceModels },
          { title: "Active Quotas", icon: Zap, value: stats.activeQuotas }
        ].map((item, i) => (
          <Card key={i} className="bg-card/50 backdrop-blur-sm border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{item.title}</CardTitle>
              <item.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? '-' : item.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
