
import { useState } from "react";
import { MapPin, Clock, CreditCard, Package, Printer, Check, Truck, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

interface Order {
  id: string;
  session_id: string;
  total: number;
  address: string;
  payment_method: string;
  status: string;
  observations: string | null;
  items: any;
  estimated_delivery: string | null;
  created_at: string;
  updated_at: string;
}

interface OrderCardProps {
  order: Order;
  onStatusChange: () => void;
}

export const OrderCard = ({ order, onStatusChange }: OrderCardProps) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();

  const getKeyword = () => {
    if (order.observations) {
      const match = order.observations.match(/Palavra-chave:\s*(\d+)/);
      return match ? match[1] : "N/A";
    }
    return "N/A";
  };

  const getItemsDescription = () => {
    if (order.items && Array.isArray(order.items) && order.items.length > 0) {
      return order.items[0]?.description || "Itens não especificados";
    }
    return "Itens não especificados";
  };

  const updateOrderStatus = async (newStatus: string) => {
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from("pedidos_orders")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", order.id);

      if (error) throw error;

      toast({
        title: "Status atualizado",
        description: `Pedido movido para ${getStatusLabel(newStatus)}`,
      });
      
      onStatusChange();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o status do pedido",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const getStatusLabel = (status: string) => {
    const labels = {
      confirmed: "Confirmados",
      preparing: "Preparando", 
      delivering: "Entregando",
      delivered: "Entregues"
    };
    return labels[status] || status;
  };

  const getNextStatus = () => {
    const statusFlow = {
      confirmed: "preparing",
      preparing: "delivering", 
      delivering: "delivered",
      delivered: null
    };
    return statusFlow[order.status];
  };

  const getActionButton = () => {
    const nextStatus = getNextStatus();
    if (!nextStatus) return null;

    const buttonConfig = {
      preparing: { icon: Package, text: "Iniciar Preparo", variant: "default" as const },
      delivering: { icon: Truck, text: "Saiu para Entrega", variant: "default" as const },
      delivered: { icon: CheckCircle, text: "Marcar Entregue", variant: "default" as const }
    };

    const config = buttonConfig[nextStatus];
    const IconComponent = config.icon;

    return (
      <Button
        onClick={() => updateOrderStatus(nextStatus)}
        disabled={isUpdating}
        size="sm"
        variant={config.variant}
        className="w-full"
      >
        <IconComponent className="h-4 w-4 mr-2" />
        {config.text}
      </Button>
    );
  };

  const handlePrint = () => {
    const printContent = `
      PEDIDO ${getKeyword()}
      
      Cliente: ${order.session_id}
      Endereço: ${order.address}
      
      Itens:
      ${getItemsDescription()}
      
      Total: R$ ${order.total.toFixed(2)}
      Pagamento: ${order.payment_method}
      
      Pedido em: ${new Date(order.created_at).toLocaleString()}
    `;
    
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Pedido ${getKeyword()}</title>
            <style>
              body { font-family: monospace; font-size: 12px; margin: 20px; }
              .header { text-align: center; font-weight: bold; margin-bottom: 20px; }
            </style>
          </head>
          <body>
            <div class="header">PEDIDO ${getKeyword()}</div>
            <pre>${printContent}</pre>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono">
            #{getKeyword()}
          </Badge>
          <span className="text-xs text-gray-500">
            {new Date(order.created_at).toLocaleTimeString('pt-BR', { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </span>
        </div>
        <Button
          onClick={handlePrint}
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
        >
          <Printer className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-start gap-2">
          <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
          <span className="text-sm text-gray-700 break-words">{order.address}</span>
        </div>

        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="text-sm text-gray-700 line-clamp-2">
            {getItemsDescription()}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="text-sm text-gray-700">{order.payment_method}</span>
        </div>

        {order.estimated_delivery && (
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <span className="text-sm text-gray-700">
              {new Date(order.estimated_delivery).toLocaleTimeString('pt-BR', { 
                hour: '2-digit', 
                minute: '2-digit' 
              })}
            </span>
          </div>
        )}
      </div>

      <div className="flex justify-between items-center">
        <span className="font-semibold text-green-600">
          R$ {order.total.toFixed(2)}
        </span>
        {getActionButton()}
      </div>
    </div>
  );
};
