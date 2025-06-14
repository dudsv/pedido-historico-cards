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
  toppings: any;
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

  const getMainItems = () => {
    if (order.items && Array.isArray(order.items) && order.items.length > 0) {
      return order.items.map((item, index) => (
        <div key={index} className="text-sm text-gray-700 font-medium">
          {item.description || item.name || "Item não especificado"}
        </div>
      ));
    }
    
    // Extrair produto principal e toppings da mensagem de observações
    if (order.observations) {
      const fullMessage = order.observations;
      
      // Extrair linha que contém o produto e toppings (antes de "Total:")
      const itemsMatch = fullMessage.match(/^(.+?)(?=\s*Total:)/s);
      if (itemsMatch) {
        const itemsText = itemsMatch[1].trim();
        
        // Limpar qualquer quebra de linha e espaços extras
        const cleanedText = itemsText.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
        
        return (
          <div className="text-sm text-gray-700 font-medium">
            {cleanedText}
          </div>
        );
      }
    }
    
    return (
      <div className="text-sm text-gray-700 font-medium">
        Itens não especificados
      </div>
    );
  };

  const getToppings = () => {
    if (order.toppings && Array.isArray(order.toppings) && order.toppings.length > 0) {
      return order.toppings.map((topping, index) => (
        <div key={index} className="text-sm text-gray-600 ml-2">
          - Topping: {topping.name}
        </div>
      ));
    }
    return null;
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
    const toppingsText = order.toppings && Array.isArray(order.toppings) ? 
      order.toppings.map(t => `  - Topping: ${t.name}`).join('\n') : '';
    
    const printContent = `
      PEDIDO ${getKeyword()}
      
      ${order.items && Array.isArray(order.items) ? 
        order.items.map(item => item.description || item.name || 'Item').join('\n') : 
        'Itens não especificados'
      }
      
      ${toppingsText ? `${toppingsText}` : ''}
      
      Total: R$ ${order.total.toFixed(2)}
      
      Endereço: ${order.address}
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
    <div className="bg-white rounded-lg p-4 border border-gray-200 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono">
            Pedido #{getKeyword()}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {order.status === 'confirmed' ? 'Confirmado' : 
             order.status === 'preparing' ? 'Preparando' :
             order.status === 'delivering' ? 'Entregando' : 'Entregue'}
          </Badge>
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
        <div className="text-xs text-gray-500 font-medium">Itens:</div>
        <div className="space-y-1">
          {getMainItems()}
        </div>
      </div>

      <div className="border-t pt-3 space-y-3">
        <div className="text-sm font-semibold text-green-600">
          Total: R$ {order.total.toFixed(2)}
        </div>

        <div className="flex items-start gap-2 text-xs text-gray-600">
          <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <span className="break-words">{order.address}</span>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-600">
          <CreditCard className="h-3 w-3 flex-shrink-0" />
          <span>{order.payment_method}</span>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Clock className="h-3 w-3 flex-shrink-0" />
          <span>
            {new Date(order.created_at).toLocaleTimeString('pt-BR', { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </span>
        </div>

        {getActionButton()}
      </div>
    </div>
  );
};
