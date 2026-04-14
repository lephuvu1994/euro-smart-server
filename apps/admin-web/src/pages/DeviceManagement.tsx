import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';
import { Loader2, Server, Plus, Key, Cpu, ShieldAlert, MonitorCheck } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';

interface HardwareRecord {
  id: string;
  identifier: string;
  deviceToken: string;
  deviceModelCode: string;
  partnerCode: string;
  firmwareVer: string | null;
  isBanned: boolean;
  activatedAt: string;
}

export default function DeviceManagement() {
  const [hardwares, setHardwares] = useState<HardwareRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const token = useAuthStore((state) => state.token);

  useEffect(() => {
    fetchHardwares();
  }, [token]);

  const fetchHardwares = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/hardwares');
      const data = res.data?.data || res.data;
      if (Array.isArray(data)) {
        setHardwares(data);
      }
    } catch (err) {
      console.error('Failed to fetch hardwares', err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = hardwares.filter(
    (h) =>
      h.identifier.toLowerCase().includes(search.toLowerCase()) ||
      h.partnerCode.toLowerCase().includes(search.toLowerCase()) ||
      h.deviceModelCode.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-full flex-col max-w-7xl mx-auto p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Server className="h-8 w-8 text-primary" />
            Hardware Registry
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage physical IoT chips, provision tokens, and partner ownership.
          </p>
        </div>
        <Button className="gap-2 shadow-lg shadow-primary/20">
          <Plus size={16} />
          Provision Hardware
        </Button>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden bg-card/40 backdrop-blur-md border-border shadow-xl">
        <div className="p-4 border-b border-border flex gap-4 bg-muted/20">
          <Input
            placeholder="Search MAC Address, Partner, or Model..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md bg-background/50"
          />
        </div>
        
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center space-y-4 text-muted-foreground">
               <Loader2 className="h-8 w-8 animate-spin" />
               <p>Loading registry...</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead>Identifier (MAC/IMEI)</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Activated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No hardware records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((hw) => (
                    <TableRow key={hw.id} className="border-border">
                      <TableCell className="font-mono text-sm font-semibold flex items-center gap-2 text-white">
                        <Cpu className="h-4 w-4 text-primary" />
                        {hw.identifier}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <span className="bg-primary/10 text-primary px-2 py-1 flex max-w-max rounded-md text-xs font-mono">{hw.partnerCode}</span>
                      </TableCell>
                      <TableCell>
                        <span className="bg-muted px-2 py-1 rounded-md text-xs text-white">{hw.deviceModelCode}</span>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[120px]">
                        {hw.deviceToken.substring(0, 8)}...
                      </TableCell>
                      <TableCell>
                        {hw.isBanned ? (
                          <span className="flex items-center gap-1 text-destructive text-xs"><ShieldAlert className="h-3 w-3" /> Banned</span>
                        ) : (
                          <span className="flex items-center gap-1 text-emerald-400 text-xs"><MonitorCheck className="h-3 w-3" /> Active</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground text-xs font-mono">
                        {new Date(hw.activatedAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}
