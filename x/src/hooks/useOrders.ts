import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Order } from '../types/order';
import { useToast } from '@/hooks/use-toast';

export const useOrders = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const extractOrderFromMessages = (messages: any[]) => {
    const orders: Order[] = [];
    const sessionGroups: { [key: string]: any[] } = {};
    
    // Group messages by session
    messages.forEach(msg => {
      if (!sessionGroups[msg.session_id]) {
        sessionGroups[msg.session_id] = [];
      }
      sessionGroups[msg.session_id].push(msg);
    });

    // Process each session
    Object.entries(sessionGroups).forEach(([sessionId, sessionMessages]) => {
      // Find AI messages that contain structured order information
      const orderMessages = sessionMessages.filter(msg => 
        msg.message?.type === 'ai' && 
        msg.message?.content &&
        (msg.message.content.includes('valor_total:') || msg.message.content.includes('Valor Total:'))
      );

      if (orderMessages.length > 0) {
        // Use the latest message with order info
        const orderMessage = orderMessages[orderMessages.length - 1];
        const content = orderMessage.message.content;
        
        // Extract using new structured tags
        let total = 0;
        let items: any[] = [];
        let toppings: any[] = [];
        let address = '';
        let paymentMethod = '';
        let observations = '';

        // Extract valor_total using the new tag format
        const totalMatch = content.match(/valor_total:\s*(?:R\$\s*)?(\d+[.,]\d{2})/i);
        if (totalMatch) {
          total = parseFloat(totalMatch[1].replace(',', '.'));
        }

        // If no structured tag found, try the old format as fallback
        if (total === 0) {
          const fallbackTotalMatch = content.match(/Valor Total:\s*\*\*R\$\s*(\d+)\*\*/);
          if (fallbackTotalMatch) {
            total = parseFloat(fallbackTotalMatch[1]);
          }
        }

        // Extract items using structured tags
        const acaiMatches = content.match(/item_açai:\s*([^-]+)\s*-\s*R\$\s*(\d+[.,]?\d*)/gi);
        if (acaiMatches) {
          acaiMatches.forEach(match => {
            const itemMatch = match.match(/item_açai:\s*([^-]+)\s*-\s*R\$\s*(\d+[.,]?\d*)/i);
            if (itemMatch) {
              const name = itemMatch[1].trim();
              const price = parseFloat(itemMatch[2].replace(',', '.'));
              items.push({ name, price });
            }
          });
        }

        const smoothieMatches = content.match(/item_smoothie:\s*([^-]+)\s*-\s*R\$\s*(\d+[.,]?\d*)/gi);
        if (smoothieMatches) {
          smoothieMatches.forEach(match => {
            const itemMatch = match.match(/item_smoothie:\s*([^-]+)\s*-\s*R\$\s*(\d+[.,]?\d*)/i);
            if (itemMatch) {
              const name = itemMatch[1].trim();
              const price = parseFloat(itemMatch[2].replace(',', '.'));
              items.push({ name, price });
            }
          });
        }

        // Extract toppings using structured tags
        const toppingMatches = content.match(/item_topping:\s*([^-]+)\s*-\s*R\$\s*(\d+[.,]?\d*)/gi);
        if (toppingMatches) {
          toppingMatches.forEach(match => {
            const toppingMatch = match.match(/item_topping:\s*([^-]+)\s*-\s*R\$\s*(\d+[.,]?\d*)/i);
            if (toppingMatch) {
              const name = toppingMatch[1].trim();
              const price = parseFloat(toppingMatch[2].replace(',', '.'));
              toppings.push({ name, price });
            }
          });
        }

        // Fallback to old format if no structured items found
        if (items.length === 0) {
          const fallbackAcaiMatch = content.match(/Açaí \d+\s*oz:\s*\*\*R\$\s*(\d+)\*\*/);
          if (fallbackAcaiMatch) {
            items.push({ 
              name: content.match(/Açaí \d+\s*oz/)?.[0] || 'Açaí',
              price: parseFloat(fallbackAcaiMatch[1])
            });
          }

          // Extract toppings from old format
          const toppingLines = content.match(/- Topping:[^:]+:\s*\*\*(?:Grátis|R\$\s*\d+)\*\*/g);
          if (toppingLines) {
            toppingLines.forEach(line => {
              const toppingMatch = line.match(/- Topping:\s*([^:]+):\s*\*\*(Grátis|R\$\s*(\d+))\*\*/);
              if (toppingMatch) {
                const name = toppingMatch[1].trim();
                const priceText = toppingMatch[2];
                const price = priceText === 'Grátis' ? 0 : parseFloat(toppingMatch[3] || '0');
                toppings.push({ name, price });
              }
            });
          }
        }

        // Extract address using structured tag
        const addressMatch = content.match(/endereco_cliente:\s*([^\n]+)/i);
        if (addressMatch) {
          address = addressMatch[1].trim();
        } else {
          // Fallback to old format
          const fallbackAddressMatch = content.match(/Endereço:\s*\*\*([^*]+)\*\*/);
          if (fallbackAddressMatch) {
            address = fallbackAddressMatch[1].trim();
          }
        }

        // Extract payment method using structured tag
        const paymentMatch = content.match(/forma_pagamento:\s*([^\n]+)/i);
        if (paymentMatch) {
          paymentMethod = paymentMatch[1].trim();
        } else {
          // Fallback to old format
          const fallbackPaymentMatch = content.match(/Forma de pagamento:\s*\*\*([^*]+)\*\*/);
          if (fallbackPaymentMatch) {
            paymentMethod = fallbackPaymentMatch[1].trim();
          }
        }

        // Extract observations using structured tag
        const observationMatch = content.match(/observacao_cliente:\s*([^\n]+)/i);
        if (observationMatch) {
          observations = observationMatch[1].trim();
          if (observations === 'Nenhuma observação adicional') {
            observations = '';
          }
        }

        // Only create order if we have valid data
        if (total > 0 || items.length > 0) {
          // If total is 0 but we have items, calculate total from items
          if (total === 0 && items.length > 0) {
            total = items.reduce((sum, item) => sum + item.price, 0) + 
                   toppings.reduce((sum, topping) => sum + topping.price, 0);
          }

          // If no items but we have a total, create a generic item
          if (items.length === 0 && total > 0) {
            items.push({ name: 'Açaí', price: total });
          }

          const order: Order = {
            id: `order-${sessionId.slice(-8)}`,
            sessionId,
            items,
            toppings,
            total,
            address: address || 'Endereço não informado',
            paymentMethod: paymentMethod || 'Não informado',
            status: 'confirmed',
            createdAt: orderMessage.created_at || new Date().toISOString(),
            estimatedDelivery: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
            observations
          };

          orders.push(order);
        }
      }
    });

    return orders;
  };

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch messages from chat histories
      const { data: messages, error: messagesError } = await supabase
        .from('n8n_chat_histories')
        .select('*')
        .order('id', { ascending: true });

      if (messagesError) {
        throw messagesError;
      }

      if (messages && messages.length > 0) {
        const extractedOrders = extractOrderFromMessages(messages);
        setOrders(extractedOrders);
        
        console.log('Extracted orders:', extractedOrders);
      } else {
        setOrders([]);
      }

    } catch (err: any) {
      console.error('Error fetching orders:', err);
      setError(err.message || 'Erro ao carregar pedidos');
      toast({
        title: "Erro",
        description: "Não foi possível carregar os pedidos. Verifique a conexão.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId: string, newStatus: 'confirmed' | 'preparing' | 'delivering' | 'delivered') => {
    try {
      // Update the order status in the local state
      setOrders(prevOrders => 
        prevOrders.map(order => 
          order.id === orderId 
            ? { ...order, status: newStatus }
            : order
        )
      );

      toast({
        title: "Status atualizado",
        description: `Pedido marcado como ${newStatus === 'confirmed' ? 'confirmado' : 
          newStatus === 'preparing' ? 'preparando' : 
          newStatus === 'delivering' ? 'saiu para entrega' : 'entregue'}.`,
      });

    } catch (err: any) {
      console.error('Error updating order status:', err);
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o status do pedido.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const refetch = () => {
    fetchOrders();
  };

  return {
    orders,
    loading,
    error,
    refetch,
    updateOrderStatus
  };
};
