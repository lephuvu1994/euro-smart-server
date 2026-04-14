import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';
import { Loader2, Settings, Save, Server, Shield } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';

export default function SystemConfig() {
  const [loading, setLoading] = useState(true);
  const [formLoading, setFormLoading] = useState(false);
  const [formData, setFormData] = useState({
    mqttHost: '',
    otpExpire: 5,
  });

  const token = useAuthStore((state) => state.token);

  useEffect(() => {
    fetchConfigs();
  }, [token]);

  const fetchConfigs = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/configs');
      const data = res.data?.data || res.data;
      if (data) {
        setFormData({
          mqttHost: data.mqttHost || '',
          otpExpire: data.otpExpire || 5,
        });
      }
    } catch (err) {
      console.error('Failed to fetch configs', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setFormLoading(true);
      await api.put('/admin/configs', {
        mqttHost: formData.mqttHost,
        otpExpire: Number(formData.otpExpire),
      });
      alert('System configurations updated successfully!');
      fetchConfigs();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update configs');
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col max-w-4xl mx-auto p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Settings className="h-8 w-8 text-primary" />
            System Config
          </h1>
          <p className="text-muted-foreground mt-1">
            Global environment variables and system behavior definitions.
          </p>
        </div>
        <Button onClick={handleSave} disabled={formLoading} className="gap-2 shadow-lg shadow-primary/20">
          {formLoading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Save Configuration
        </Button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-6">
          <Card className="bg-card/40 backdrop-blur-md border-border shadow-md">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Server className="h-5 w-5 text-primary" />
                Infrastructure Setup
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Global MQTT Broker URL</label>
                <Input
                  value={formData.mqttHost}
                  onChange={(e) => setFormData({ ...formData, mqttHost: e.target.value })}
                  placeholder="e.g. mqtt://broker.example.com:1883"
                  className="font-mono bg-background/50"
                />
                <p className="text-xs text-muted-foreground">This is the default broker string assigned to new Smart Devices during provisioning.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/40 backdrop-blur-md border-border shadow-md">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Security Policies
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">OTP Expiration Timer (Minutes)</label>
                <Input
                  type="number"
                  min="1"
                  max="60"
                  value={formData.otpExpire}
                  onChange={(e) => setFormData({ ...formData, otpExpire: parseInt(e.target.value) || 5 })}
                  className="bg-background/50 max-w-[200px]"
                />
                <p className="text-xs text-muted-foreground">Applicable for system-wide mobile App logins and strict validations.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
