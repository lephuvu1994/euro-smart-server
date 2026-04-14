import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';
import { Loader2, Building, Plus, Maximize2, Zap } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';

interface QuotaUsage {
  modelCode: string;
  modelName: string;
  used: number;
  total: number;
}

interface Partner {
  companyCode: string;
  companyName: string;
  quotas: QuotaUsage[];
}

export default function PartnerManagement() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modals
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);

  // Add Form
  const [formData, setFormData] = useState({ code: '', name: '' });
  const [formLoading, setFormLoading] = useState(false);

  const token = useAuthStore((state) => state.token);

  useEffect(() => {
    if (!token) return;
    fetchPartners();
  }, [token]);

  const fetchPartners = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/stats/partners');
      const data = res.data?.data || res.data;
      if (Array.isArray(data)) {
        setPartners(data);
      }
    } catch (err) {
      console.error('Failed to fetch partners', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSubmit = async () => {
      try {
        setFormLoading(true);
        await api.post('/admin/partners', formData);
        setIsAddOpen(false);
        setFormData({ code: '', name: '' });
        fetchPartners();
      } catch (err: any) {
        alert(err.response?.data?.message || 'Failed to add partner');
      } finally {
        setFormLoading(false);
      }
    };

    const openDetails = (partner: Partner) => {
      setSelectedPartner(partner);
      setIsDetailOpen(true);
    };

    const filtered = partners.filter(
      (p) =>
        p.companyName.toLowerCase().includes(search.toLowerCase()) ||
        p.companyCode.toLowerCase().includes(search.toLowerCase()),
    );

    return (
      <div className="flex h-full flex-col max-w-6xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Building className="h-8 w-8 text-primary" />
              Partners
            </h1>
            <p className="text-muted-foreground mt-1">
              B2B Organization accounts and quota usage.
            </p>
          </div>
          <Button
            onClick={() => setIsAddOpen(true)}
            className="gap-2 shadow-lg shadow-primary/20"
          >
            <Plus size={16} />
            Add Partner
          </Button>
        </div>

        <Card className="flex-1 flex flex-col overflow-hidden bg-card/40 backdrop-blur-md border-border shadow-xl">
          <div className="p-4 border-b border-border flex gap-4 bg-muted/20">
            <Input
              placeholder="Search organizations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm bg-background/50"
            />
          </div>

          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center space-y-4 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p>Loading records...</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="w-[150px]">Code</TableHead>
                    <TableHead className="w-[200px]">
                      Organization Name
                    </TableHead>
                    <TableHead>Quotas (Active/Limit)</TableHead>
                    <TableHead className="w-[150px] text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="h-24 text-center text-muted-foreground"
                      >
                        No partners found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((partner) => (
                      <TableRow
                        key={partner.companyCode}
                        className="border-border group"
                      >
                        <TableCell className="font-mono text-xs">
                          {partner.companyCode}
                        </TableCell>
                        <TableCell className="font-medium text-white">
                          {partner.companyName}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center text-muted-foreground text-sm font-medium">
                            <Zap className="h-4 w-4 mr-2 text-primary" />
                            {partner.quotas.length} Active Licenses
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            onClick={() => openDetails(partner)}
                            variant="outline"
                            size="sm"
                            className="bg-primary/10 border-primary/20 hover:bg-primary/20 text-primary"
                          >
                            <Maximize2 className="h-4 w-4 mr-2" />
                            View Quotas
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

        {/* ADD PARTNER MODAL */}
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Add New Partner</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Partner Code</label>
                <Input
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value })
                  }
                  placeholder="e.g. COMPANY_ABC"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Organization Name</label>
                <Input
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="e.g. ABC Smart Home Inc."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddSubmit} disabled={formLoading}>
                {formLoading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create Partner
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* QUOTAS DETAIL MODAL */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="sm:max-w-[800px] max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building className="h-5 w-5 text-primary" />
                {selectedPartner?.companyName}
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                Detailed quota usage across all device models.
              </p>
            </DialogHeader>

            <div className="flex-1 overflow-auto border rounded-md my-4 border-border">
              <Table>
                <TableHeader className="bg-muted/50 sticky top-0">
                  <TableRow>
                    <TableHead className="w-[120px]">Model Code</TableHead>
                    <TableHead>Device Model</TableHead>
                    <TableHead className="w-[200px]">Usage Capacity</TableHead>
                    <TableHead className="text-right w-[100px]">
                      Used/Total
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedPartner?.quotas.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="h-24 text-center text-muted-foreground"
                      >
                        No licenses assigned to this partner yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    selectedPartner?.quotas.map((q) => (
                      <TableRow key={q.modelCode} className="border-border">
                        <TableCell className="font-mono text-xs">
                          {q.modelCode}
                        </TableCell>
                        <TableCell className="font-medium text-white">
                          {q.modelName}
                        </TableCell>
                        <TableCell>
                          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full ${q.used >= q.total ? 'bg-destructive' : 'bg-primary'}`}
                              style={{
                                width: `${Math.min(100, (q.used / (q.total || 1)) * 100)}%`,
                              }}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          <span
                            className={
                              q.used >= q.total
                                ? 'text-destructive font-bold'
                                : ''
                            }
                          >
                            {q.used}
                          </span>
                          <span className="text-muted-foreground">
                            {' '}
                            / {q.total}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  );
}
