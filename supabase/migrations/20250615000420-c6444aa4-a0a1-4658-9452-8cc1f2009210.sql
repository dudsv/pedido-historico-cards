
-- Atualizar a função para detectar corretamente os padrões das mensagens reais
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
    
    -- Detectar padrão mais flexível: palavra-chave + itens + total (sem exigir "Pedido confirmado")
    IF ai_content ~* 'Palavra-chave:\s*\*?\*?\d{4}' AND 
       ai_content ~* 'Itens do Pedido:' AND 
       ai_content ~* 'Total:\s*R\$' THEN
      
      -- Extrair palavra-chave (4 dígitos, pode ter asteriscos)
      keyword_text := (regexp_match(ai_content, 'Palavra-chave:\s*\*?\*?(\d{4})', 'i'))[1];
      
      -- Extrair total
      total_text := (regexp_match(ai_content, 'Total:\s*R\$\s*([0-9]+(?:[.,][0-9]{1,2})?)', 'i'))[1];
      IF total_text IS NOT NULL THEN
        total_text := replace(total_text, ',', '.');
        total_value := CAST(total_text AS DECIMAL(10,2));
      END IF;
      
      -- Extrair endereço
      address_text := (regexp_match(ai_content, 'Endereço:\s*\*?\*?([^\n\r*]+)', 'i'))[1];
      IF address_text IS NOT NULL THEN
        address_text := trim(address_text);
      END IF;
      
      -- Extrair forma de pagamento
      payment_text := (regexp_match(ai_content, 'Pagamento:\s*\*?\*?([^\n\r*]+)', 'i'))[1];
      IF payment_text IS NOT NULL THEN
        payment_text := trim(payment_text);
      END IF;
      
      -- Extrair itens do pedido (mais flexível)
      items_text := (regexp_match(ai_content, 'Itens do Pedido:\s*\*?\*?\s*\n(.*?)\n\*?\*?Total:', 'gis'))[1];
      
      -- Se não encontrou com o padrão acima, tentar outro padrão
      IF items_text IS NULL THEN
        items_text := (regexp_match(ai_content, 'Itens do Pedido:\s*\*?\*?\s*\n(.*?)\n\*?\*?Endereço:', 'gis'))[1];
      END IF;
      
      -- Processar itens em formato JSON
      IF items_text IS NOT NULL THEN
        items_array := '[]'::jsonb;
        
        FOR item_line IN 
          SELECT unnest(string_to_array(trim(items_text), E'\n'))
        LOOP
          IF trim(item_line) != '' AND item_line !~ '^\s*$' THEN
            -- Limpar formatação markdown
            item_name := trim(regexp_replace(item_line, '^[\s\-\*]*', ''));
            item_name := trim(regexp_replace(item_name, '\*\*', '', 'g'));
            
            -- Se tem ":" significa que pode ter subitens
            IF item_name ~ ':' THEN
              -- Pegar só a parte antes dos dois pontos
              item_name := trim(split_part(item_name, ':', 1));
            END IF;
            
            IF item_name != '' THEN
              items_array := items_array || jsonb_build_object(
                'name', item_name,
                'price', 0 -- Preço individual não especificado
              );
            END IF;
          END IF;
        END LOOP;
      END IF;
      
      -- Se não conseguiu extrair itens, criar um item genérico
      IF jsonb_array_length(items_array) = 0 THEN
        items_array := jsonb_build_array(jsonb_build_object(
          'name', 'Pedido de Açaí',
          'price', COALESCE(total_value, 0)
        ));
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
            payment_method
          ) VALUES (
            NEW.session_id,
            keyword_text,
            items_array,
            total_value,
            COALESCE(address_text, 'Endereço não informado'),
            COALESCE(payment_text, 'Não informado')
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

-- Processar as mensagens existentes novamente com a nova lógica
DO $$
DECLARE
  existing_record RECORD;
  ai_content TEXT;
  keyword_text VARCHAR(10);
  total_text VARCHAR(20);
  total_value DECIMAL(10,2);
  address_text TEXT;
  payment_text VARCHAR(100);
  items_text TEXT;
  items_array JSONB := '[]'::jsonb;
  item_line TEXT;
  item_name TEXT;
BEGIN
  -- Primeiro, limpar dados antigos para reprocessar
  DELETE FROM public.pedidos_orders;
  
  FOR existing_record IN 
    SELECT * FROM public.n8n_chat_histories 
    WHERE message->>'type' = 'ai'
      AND message->>'content' ~* 'Palavra-chave:\s*\*?\*?\d{4}'
      AND message->>'content' ~* 'Itens do Pedido:'
      AND message->>'content' ~* 'Total:\s*R\$'
    ORDER BY id DESC
  LOOP
    ai_content := existing_record.message->>'content';
    
    -- Extrair dados com padrões mais flexíveis
    keyword_text := (regexp_match(ai_content, 'Palavra-chave:\s*\*?\*?(\d{4})', 'i'))[1];
    total_text := (regexp_match(ai_content, 'Total:\s*R\$\s*([0-9]+(?:[.,][0-9]{1,2})?)', 'i'))[1];
    
    IF total_text IS NOT NULL THEN
      total_text := replace(total_text, ',', '.');
      total_value := CAST(total_text AS DECIMAL(10,2));
    END IF;
    
    address_text := (regexp_match(ai_content, 'Endereço:\s*\*?\*?([^\n\r*]+)', 'i'))[1];
    IF address_text IS NOT NULL THEN
      address_text := trim(address_text);
    END IF;
    
    payment_text := (regexp_match(ai_content, 'Pagamento:\s*\*?\*?([^\n\r*]+)', 'i'))[1];
    IF payment_text IS NOT NULL THEN
      payment_text := trim(payment_text);
    END IF;
    
    -- Extrair itens
    items_text := (regexp_match(ai_content, 'Itens do Pedido:\s*\*?\*?\s*\n(.*?)\n\*?\*?Total:', 'gis'))[1];
    IF items_text IS NULL THEN
      items_text := (regexp_match(ai_content, 'Itens do Pedido:\s*\*?\*?\s*\n(.*?)\n\*?\*?Endereço:', 'gis'))[1];
    END IF;
    
    -- Processar itens
    items_array := '[]'::jsonb;
    
    IF items_text IS NOT NULL THEN
      FOR item_line IN 
        SELECT unnest(string_to_array(trim(items_text), E'\n'))
      LOOP
        IF trim(item_line) != '' AND item_line !~ '^\s*$' THEN
          item_name := trim(regexp_replace(item_line, '^[\s\-\*]*', ''));
          item_name := trim(regexp_replace(item_name, '\*\*', '', 'g'));
          
          IF item_name ~ ':' THEN
            item_name := trim(split_part(item_name, ':', 1));
          END IF;
          
          IF item_name != '' THEN
            items_array := items_array || jsonb_build_object(
              'name', item_name,
              'price', 0
            );
          END IF;
        END IF;
      END LOOP;
    END IF;
    
    -- Se não conseguiu extrair itens, criar um genérico
    IF jsonb_array_length(items_array) = 0 THEN
      items_array := jsonb_build_array(jsonb_build_object(
        'name', 'Pedido de Açaí',
        'price', COALESCE(total_value, 0)
      ));
    END IF;
    
    -- Inserir se temos dados essenciais
    IF keyword_text IS NOT NULL AND total_value > 0 THEN
      BEGIN
        INSERT INTO public.pedidos_orders (
          session_id,
          keyword,
          items,
          total,
          address,
          payment_method
        ) VALUES (
          existing_record.session_id,
          keyword_text,
          items_array,
          total_value,
          COALESCE(address_text, 'Endereço não informado'),
          COALESCE(payment_text, 'Não informado')
        );
        
        RAISE NOTICE 'Pedido processado - Keyword: %, Total: R$ %', keyword_text, total_value;
        
      EXCEPTION WHEN unique_violation THEN
        NULL; -- Ignora duplicatas
      END;
    END IF;
  END LOOP;
END $$;
