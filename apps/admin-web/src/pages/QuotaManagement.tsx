import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';
import { Loader2, Zap, LayoutGrid, Edit2 } from 'lucide-react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';

interface QuotaRecord {
  id: string;
  partner: { code: string; name: string };
  deviceModel: { code: string; name: string };
  maxQuantity: number;
  activatedCount: number;
  licenseDays: number;
  isActive: boolean;
}

export default function QuotaManagement() {
  const [quotas, setQuotas] = useState<QuotaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Edit Modal
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<QuotaRecord | null>(null);
  const [qty, setQty] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const token = useAuthStore((state) => state.token);

  useEffect(() => {
    if (!token) return;
    fetchQuotas();
  }, [token]);

  const fetchQuotas = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/quotas');
      const data = res.data?.data || res.data;
      if (Array.isArray(data)) {
        setQuotas(data);
      }
    } catch (err) {
      console.error('Failed to fetch quotas', err);
    } finally {
      setLoading(false);
    }
  };

  const openEdit = (record: QuotaRecord) => {
    setEditing(record);
    setQty(record.maxQuantity.toString());
    setIsOpen(true);
  };

  const handleUpdate = async () => {
    if (!editing) return;
    try {
      setFormLoading(true);
      await api.put(`/admin/partners/${editing.partner.code}`, {
        quotas: [
          {
            deviceModelCode: editing.deviceModel.code,
            quantity: parseInt(qty, 10),
          }
        ]
      });
      setIsOpen(false);
      fetchQuotas();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Update failed');
    } finally {
      setFormLoading(false);
    }
  };

  const filtered = quotas.filter(
    (q) =>
      q.partner.name.toLowerCase().includes(search.toLowerCase()) ||
      q.partner.code.toLowerCase().includes(search.toLowerCase()) ||
      q.deviceModel.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-full flex-col max-w-6xl mx-auto p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <LayoutGrid className="h-8 w-8 text-primary" />
            Quota & Licenses
          </h1>
          <p className="text-muted-foreground mt-1">
            Global view of license limits mapped between Partners and Models.
          </p>
        </div>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden bg-card/40 backdrop-blur-md border-border shadow-xl">
        <div className="p-4 border-b border-border flex gap-4 bg-muted/20">
          <Input
            placeholder="Search by partner or model code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md bg-background/50"
          />
        </div>
        
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center space-y-4 text-muted-foreground">
               <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead>Partner</TableHead>
                  <TableHead>Device Model</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Usage Bar</TableHead>
                  <TableHead className="w-[100px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      No matching quotas found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((q) => (
                    <TableRow key={q.id} className="border-border">
                      <TableCell>
                        <div className="font-medium text-white">{q.partner.name}</div>
                        <div className="text-xs text-muted-foreground">{q.partner.code}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{q.deviceModel.code}</TableCell>
                      <TableCell>
                         <span className="bg-primary/20 text-primary px-2 py-1 rounded-md text-xs">
                           {q.isActive ? 'Active' : 'Disabled'}
                         </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                           <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                             <div 
                               className={`h-full ${q.activatedCount >= q.maxQuantity ? 'bg-destructive' : 'bg-primary'}`}
                               style={{ width: `${Math.min(100, (q.activatedCount / (q.maxQuantity || 1)) * 100)}%` }} 
                             />
                           </div>
                           <span className="w-[45px] text-right font-mono text-xs text-muted-foreground">
                             {q.activatedCount}/{q.maxQuantity}
                           </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          onClick={() => openEdit(q)}
                          variant="ghost" 
                          size="sm" 
                          className="text-muted-foreground hover:text-white"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Adjust License Limit</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="bg-muted/50 p-3 rounded-md border border-border space-y-1">
               <div className="text-xs text-muted-foreground">Target Partner</div>
               <div className="font-semibold">{editing?.partner.name}</div>
               <div className="text-xs text-muted-foreground mt-2">Device Model</div>
               <div className="font-mono">{editing?.deviceModel.code}</div>
            </div>

            <div className="grid gap-2 mt-2">
              <label className="text-sm font-medium">Max Quantity (Limit)</label>
              <Input
                type="number"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={formLoading}>
              {formLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Limit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
