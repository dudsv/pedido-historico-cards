
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Package, Clock, TrendingUp, AlertCircle } from 'lucide-react';
import { useOrdersQuery } from '@/hooks/useOrdersQuery';
import { useUpdateOrderStatus } from '@/hooks/useUpdateOrderStatus';
import OrderCard from './OrderCard';

const OrdersDashboard = () => {
  const { data: orders = [], isLoading: loading, error, refetch } = useOrdersQuery();
  const updateOrderStatus = useUpdateOrderStatus();
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const filteredOrders = selectedStatus === 'all' 
    ? orders 
    : orders.filter(order => order.status === selectedStatus);

  const statusCounts = {
    confirmed: orders.filter(o => o.status === 'confirmed').length,
    preparing: orders.filter(o => o.status === 'preparing').length,
    delivering: orders.filter(o => o.status === 'delivering').length,
    delivered: orders.filter(o => o.status === 'delivered').length,
  };

  const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);

  const handleStatusChange = (orderId: string, newStatus: 'confirmed' | 'preparing' | 'delivering' | 'delivered') => {
    console.log('Mudança de status solicitada:', { orderId, newStatus });
    updateOrderStatus.mutate({ orderId, newStatus });
  };

  const handleRefresh = () => {
    refetch();
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Erro de Conexão
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{error.message}</p>
            <Button onClick={handleRefresh} className="w-full">
              <RefreshCw className="h-4 w-4 mr-2" />
              Tentar Novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Dashboard de Pedidos - Gnomus Bowls
            </h1>
            <p className="text-muted-foreground">
              Pedidos processados automaticamente do chat WhatsApp via n8n
            </p>
          </div>
          <Button 
            onClick={handleRefresh} 
            disabled={loading || updateOrderStatus.isPending}
            variant="outline"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Pedidos</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{orders.length}</div>
              <p className="text-xs text-muted-foreground">
                Processados automaticamente
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Confirmados</CardTitle>
              <Clock className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{statusCounts.confirmed}</div>
              <p className="text-xs text-muted-foreground">
                Aguardando preparo
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Entregues</CardTitle>
              <Package className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{statusCounts.delivered}</div>
              <p className="text-xs text-muted-foreground">
                Concluídos
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Receita Total</CardTitle>
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">
                R$ {totalRevenue.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">
                Vendas do período
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Status Filter */}
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={selectedStatus === 'all' ? 'default' : 'outline'}
            onClick={() => setSelectedStatus('all')}
            size="sm"
          >
            Todos ({orders.length})
          </Button>
          <Button
            variant={selectedStatus === 'confirmed' ? 'default' : 'outline'}
            onClick={() => setSelectedStatus('confirmed')}
            size="sm"
          >
            Confirmados ({statusCounts.confirmed})
          </Button>
          <Button
            variant={selectedStatus === 'preparing' ? 'default' : 'outline'}
            onClick={() => setSelectedStatus('preparing')}
            size="sm"
          >
            Preparando ({statusCounts.preparing})
          </Button>
          <Button
            variant={selectedStatus === 'delivering' ? 'default' : 'outline'}
            onClick={() => setSelectedStatus('delivering')}
            size="sm"
          >
            Entregando ({statusCounts.delivering})
          </Button>
          <Button
            variant={selectedStatus === 'delivered' ? 'default' : 'outline'}
            onClick={() => setSelectedStatus('delivered')}
            size="sm"
          >
            Entregues ({statusCounts.delivered})
          </Button>
        </div>

        {/* Orders Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Carregando pedidos automatizados...</span>
          </div>
        ) : filteredOrders.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredOrders.map((order) => (
              <OrderCard 
                key={order.id} 
                order={order} 
                onStatusChange={handleStatusChange}
                isUpdating={updateOrderStatus.isPending}
              />
            ))}
          </div>
        ) : (
          <Card className="text-center py-12">
            <CardContent>
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum pedido encontrado</h3>
              <p className="text-muted-foreground mb-4">
                {selectedStatus === 'all' 
                  ? 'Ainda não há pedidos processados automaticamente pelo sistema.'
                  : `Não há pedidos com status "${selectedStatus}".`
                }
              </p>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Os pedidos são criados automaticamente quando um cliente finaliza uma compra via WhatsApp.
                </p>
                <Button onClick={handleRefresh} variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Verificar Novamente
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default OrdersDashboard;
