
-- Limpar TODAS as configurações prévias para evitar conflitos
DROP TABLE IF EXISTS public.pedidos_orders CASCADE;
DROP TABLE IF EXISTS public.pedidos CASCADE;
DROP TABLE IF EXISTS public.pedidos_dashboard CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;

-- Remover todas as funções relacionadas a pedidos
DROP FUNCTION IF EXISTS public.process_confirmed_order() CASCADE;
DROP FUNCTION IF EXISTS public.process_order_from_chat() CASCADE;
DROP FUNCTION IF EXISTS public.auto_process_order() CASCADE;
DROP FUNCTION IF EXISTS public.process_chat_to_order(character varying) CASCADE;
DROP FUNCTION IF EXISTS public.process_chat_to_order() CASCADE;

-- Remover todos os triggers relacionados
DROP TRIGGER IF EXISTS trigger_process_confirmed_order ON public.n8n_chat_histories;
DROP TRIGGER IF EXISTS trigger_process_order_from_chat ON public.n8n_chat_histories;
DROP TRIGGER IF EXISTS auto_process_order_trigger ON public.n8n_chat_histories;

-- Criar nova tabela otimizada baseada no fluxo n8n
CREATE TABLE public.pedidos_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(255) NOT NULL,
  keyword VARCHAR(10) NOT NULL UNIQUE,
  customer_name VARCHAR(255) DEFAULT 'Cliente WhatsApp',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total DECIMAL(10,2) NOT NULL,
  address TEXT NOT NULL,
  payment_method VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'confirmed',
  observations TEXT,
  estimated_delivery TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 minutes'),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criar função para processar pedidos baseada no prompt do agente IA
CREATE OR REPLACE FUNCTION public.process_order_from_chat()
RETURNS TRIGGER AS $$
DECLARE
  ai_content TEXT;
  keyword_text VARCHAR(10);
  items_text TEXT;
  total_text VARCHAR(20);
  total_value DECIMAL(10,2);
  address_text TEXT;
  payment_text VARCHAR(100);
  observations_text TEXT;
  items_array JSONB := '[]'::jsonb;
  item_line TEXT;
  item_name TEXT;
  item_price DECIMAL(10,2);
BEGIN
  -- Verificar se é uma mensagem AI com resumo final
  IF (NEW.message->>'type' = 'ai') THEN
    ai_content := NEW.message->>'content';
    
    -- Detectar padrão do Step 9: resumo final com palavra-chave
    IF ai_content ~* 'Palavra-chave:\s*\d{4}' AND 
       ai_content ~* 'Itens do Pedido:' AND 
       ai_content ~* 'Total:\s*R\$' AND
       ai_content ~* 'Pedido confirmado' THEN
      
      -- Extrair palavra-chave (4 dígitos gerados automaticamente)
      keyword_text := (regexp_match(ai_content, 'Palavra-chave:\s*(\d{4})', 'i'))[1];
      
      -- Extrair total
      total_text := (regexp_match(ai_content, 'Total:\s*R\$\s*([0-9]+(?:[.,][0-9]{1,2})?)', 'i'))[1];
      IF total_text IS NOT NULL THEN
        total_text := replace(total_text, ',', '.');
        total_value := CAST(total_text AS DECIMAL(10,2));
      END IF;
      
      -- Extrair endereço
      address_text := (regexp_match(ai_content, 'Endereço:\s*([^\n\r]+)', 'i'))[1];
      
      -- Extrair forma de pagamento
      payment_text := (regexp_match(ai_content, 'Pagamento:\s*([^\n\r]+)', 'i'))[1];
      
      -- Extrair observações (se existir)
      observations_text := (regexp_match(ai_content, 'Observações:\s*([^\n\r]+)', 'i'))[1];
      IF observations_text = '(se houver)' OR trim(observations_text) = '' THEN
        observations_text := NULL;
      END IF;
      
      -- Extrair itens do pedido
      items_text := (regexp_match(ai_content, 'Itens do Pedido:\s*\n(.*?)\nTotal:', 'gis'))[1];
      
      -- Processar itens em formato JSON
      IF items_text IS NOT NULL THEN
        items_array := '[]'::jsonb;
        
        FOR item_line IN 
          SELECT unnest(string_to_array(trim(items_text), E'\n'))
        LOOP
          IF item_line ~ '^-\s*' AND trim(item_line) != '' THEN
            item_name := trim(regexp_replace(item_line, '^-\s*', ''));
            
            -- Tentar extrair preço se houver
            IF item_line ~* 'R\$\s*[0-9]+' THEN
              item_price := COALESCE(
                CAST(regexp_replace(
                  (regexp_match(item_line, 'R\$\s*([0-9]+(?:[.,][0-9]{2})?)'))[1], 
                  ',', '.'
                ) AS DECIMAL(10,2)), 
                0
              );
            ELSE
              item_price := 0;
            END IF;
            
            items_array := items_array || jsonb_build_object(
              'name', item_name,
              'price', item_price
            );
          END IF;
        END LOOP;
      END IF;
      
      -- Inserir pedido se dados essenciais estão presentes
      IF keyword_text IS NOT NULL AND total_value > 0 THEN
        BEGIN
          INSERT INTO public.pedidos_orders (
            session_id,
            keyword,
            items,
            total,
            address,
            payment_method,
            observations
          ) VALUES (
            NEW.session_id,
            keyword_text,
            items_array,
            total_value,
            COALESCE(address_text, 'Endereço não informado'),
            COALESCE(payment_text, 'Não informado'),
            observations_text
          );
          
          RAISE NOTICE 'Pedido inserido - Keyword: %, Total: R$ %, Sessão: %', 
            keyword_text, total_value, NEW.session_id;
            
        EXCEPTION WHEN unique_violation THEN
          RAISE NOTICE 'Pedido já existe com keyword: %', keyword_text;
        WHEN OTHERS THEN
          RAISE NOTICE 'Erro ao inserir pedido: %', SQLERRM;
        END;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para processar automaticamente novos pedidos
CREATE TRIGGER trigger_process_order_from_chat
  AFTER INSERT ON public.n8n_chat_histories
  FOR EACH ROW
  EXECUTE FUNCTION public.process_order_from_chat();

-- Processar mensagens existentes que contêm pedidos confirmados
DO $$
DECLARE
  existing_record RECORD;
  ai_content TEXT;
  keyword_text VARCHAR(10);
  total_text VARCHAR(20);
  total_value DECIMAL(10,2);
  address_text TEXT;
  payment_text VARCHAR(100);
  observations_text TEXT;
  items_text TEXT;
  items_array JSONB := '[]'::jsonb;
BEGIN
  FOR existing_record IN 
    SELECT * FROM public.n8n_chat_histories 
    WHERE message->>'type' = 'ai'
      AND message->>'content' ~* 'Palavra-chave:\s*\d{4}'
      AND message->>'content' ~* 'Itens do Pedido:'
      AND message->>'content' ~* 'Total:\s*R\$'
      AND message->>'content' ~* 'Pedido confirmado'
    ORDER BY id DESC
  LOOP
    ai_content := existing_record.message->>'content';
    
    keyword_text := (regexp_match(ai_content, 'Palavra-chave:\s*(\d{4})', 'i'))[1];
    total_text := (regexp_match(ai_content, 'Total:\s*R\$\s*([0-9]+(?:[.,][0-9]{1,2})?)', 'i'))[1];
    
    IF total_text IS NOT NULL THEN
      total_text := replace(total_text, ',', '.');
      total_value := CAST(total_text AS DECIMAL(10,2));
    END IF;
    
    address_text := (regexp_match(ai_content, 'Endereço:\s*([^\n\r]+)', 'i'))[1];
    payment_text := (regexp_match(ai_content, 'Pagamento:\s*([^\n\r]+)', 'i'))[1];
    observations_text := (regexp_match(ai_content, 'Observações:\s*([^\n\r]+)', 'i'))[1];
    
    IF observations_text = '(se houver)' OR trim(observations_text) = '' THEN
      observations_text := NULL;
    END IF;
    
    items_text := (regexp_match(ai_content, 'Itens do Pedido:\s*\n(.*?)\nTotal:', 'gis'))[1];
    
    IF items_text IS NOT NULL THEN
      items_array := jsonb_build_array(jsonb_build_object(
        'name', trim(items_text),
        'price', COALESCE(total_value, 0)
      ));
    ELSE
      items_array := jsonb_build_array(jsonb_build_object(
        'name', 'Pedido',
        'price', COALESCE(total_value, 0)
      ));
    END IF;
    
    IF keyword_text IS NOT NULL AND total_value > 0 THEN
      BEGIN
        INSERT INTO public.pedidos_orders (
          session_id,
          keyword,
          items,
          total,
          address,
          payment_method,
          observations
        ) VALUES (
          existing_record.session_id,
          keyword_text,
          items_array,
          total_value,
          COALESCE(address_text, 'Endereço não informado'),
          COALESCE(payment_text, 'Não informado'),
          observations_text
        );
      EXCEPTION WHEN unique_violation THEN
        -- Ignora se já existe
        NULL;
      END;
    END IF;
  END LOOP;
END $$;

-- Atualizar tipos do Supabase
COMMENT ON TABLE public.pedidos_orders IS 'Tabela de pedidos processados automaticamente do chat n8n';
