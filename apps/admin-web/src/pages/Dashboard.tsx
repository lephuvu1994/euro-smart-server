import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Server, Users, Zap, Bot } from "lucide-react";

export default function Dashboard() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold tracking-tight mb-6">Dashboard</h1>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[
          { title: "Total Devices", icon: Server, value: "1,240" },
          { title: "Active Partners", icon: Users, value: "48" },
          { title: "AI Requests/day", icon: Bot, value: "12.5k" },
          { title: "Quota Used", icon: Zap, value: "84%" }
        ].map((item, i) => (
          <Card key={i} className="bg-card/50 backdrop-blur-sm border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{item.title}</CardTitle>
              <item.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{item.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
