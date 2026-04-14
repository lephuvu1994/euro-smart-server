import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';
import { Loader2, Server, Plus, Edit2, Cpu, Trash2 } from 'lucide-react';
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

interface DeviceModel {
  code: string;
  name: string;
}

export default function DeviceModelManagement() {
  const [models, setModels] = useState<DeviceModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<DeviceModel | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    config: '{}',
  });
  const [formLoading, setFormLoading] = useState(false);

  const token = useAuthStore((state) => state.token);

  useEffect(() => {
    if (!token) return;
    fetchModels();
  }, [token]);

  const fetchModels = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/options/device-models');
      // Assume standard response wrap
      const data = res.data?.data || res.data;
      if (Array.isArray(data)) {
        setModels(data);
      }
    } catch (err) {
      console.error('Failed to fetch device models', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
      setEditingModel(null);
      setFormData({ code: '', name: '', description: '', config: '{}' });
      setIsModalOpen(true);
    };

    const handleOpenEdit = (model: DeviceModel) => {
      setEditingModel(model);
      setFormData({
        code: model.code,
        name: model.name,
        description: (model as any).description || '',
        config: JSON.stringify((model as any).config || {}),
      });
      setIsModalOpen(true);
    };

    const handleSubmit = async () => {
      try {
        setFormLoading(true);
        const payload = {
          code: formData.code,
          name: formData.name,
          description: formData.description,
          config: JSON.parse(formData.config || '{}'),
        };

        if (editingModel) {
          await api.put(`/admin/device-models/${editingModel.code}`, payload);
        } else {
          await api.post('/admin/device-models', payload);
        }
        setIsModalOpen(false);
        fetchModels();
      } catch (err: any) {
        alert(err.response?.data?.message || 'Failed to save model');
      } finally {
        setFormLoading(false);
      }
    };

    const handleDelete = async () => {
      if (!editingModel) return;
      try {
        setFormLoading(true);
        await api.delete(`/admin/device-models/${editingModel.code}`);
        setIsDeleteOpen(false);
        fetchModels();
      } catch (err: any) {
        alert(err.response?.data?.message || 'Failed to delete model');
      } finally {
        setFormLoading(false);
      }
    };

    const filtered = models.filter(
      (m) =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.code.toLowerCase().includes(search.toLowerCase()),
    );

    return (
      <div className="flex h-full flex-col max-w-6xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Cpu className="h-8 w-8 text-primary" />
              Device Models
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage hardware blueprints and specifications.
            </p>
          </div>
          <Button
            onClick={handleOpenCreate}
            className="gap-2 shadow-lg shadow-primary/20"
          >
            <Plus size={16} />
            New Model
          </Button>
        </div>

        <Card className="flex-1 flex flex-col overflow-hidden bg-card/40 backdrop-blur-md border-border shadow-xl">
          <div className="p-4 border-b border-border flex gap-4 bg-muted/20">
            <Input
              placeholder="Search models..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm bg-background/50"
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
                    <TableHead className="w-[150px]">Model Code</TableHead>
                    <TableHead>Model Name</TableHead>
                    <TableHead className="w-[200px] text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="h-24 text-center text-muted-foreground"
                      >
                        No models found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((model) => (
                      <TableRow key={model.code} className="border-border">
                        <TableCell className="font-mono text-xs">
                          {model.code}
                        </TableCell>
                        <TableCell className="font-medium text-white">
                          {model.name}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            onClick={() => handleOpenEdit(model)}
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-white"
                          >
                            <Edit2 className="h-4 w-4 mr-2" />
                            Edit
                          </Button>
                          <Button
                            onClick={() => {
                              setEditingModel(model);
                              setIsDeleteOpen(true);
                            }}
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 ml-2"
                          >
                            <Trash2 className="h-4 w-4" />
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

        {/* CREATE / EDIT MODAL */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>
                {editingModel ? 'Edit Device Model' : 'Create Device Model'}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Model Code</label>
                <Input
                  disabled={!!editingModel}
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value })
                  }
                  placeholder="e.g. WIFI_SWITCH_4"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Model Name</label>
                <Input
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="e.g. 4-Gang Smart Switch"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Description</label>
                <Input
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Optional description..."
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">
                  Configuration JSON
                </label>
                <textarea
                  className="flex min-h-[150px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  value={formData.config}
                  onChange={(e) =>
                    setFormData({ ...formData, config: e.target.value })
                  }
                  placeholder="{}"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={formLoading}>
                {formLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {editingModel ? 'Save Changes' : 'Create Model'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* DELETE MODAL */}
        <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Delete Device Model</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground py-4">
              Are you sure you want to delete{' '}
              <strong className="text-white">{editingModel?.name}</strong>? This
              action cannot be undone and will fail if physical devices are
              still registered to this model.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={formLoading}
              >
                {formLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Confirm Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  );
}
