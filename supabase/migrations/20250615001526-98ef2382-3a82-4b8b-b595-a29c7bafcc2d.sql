
-- Função melhorada para capturar AMBOS os pedidos com debug detalhado
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
    
    -- Detectar padrão mais amplo para capturar diferentes formatos
    IF (ai_content ~* 'Palavra-chave.*\d{4}' OR ai_content ~* 'palavra-chave.*\d{4}') AND 
       (ai_content ~* 'Total.*R\$' OR ai_content ~* 'total.*R\$') THEN
      
      -- Extrair palavra-chave com múltiplos padrões
      keyword_text := (regexp_match(ai_content, '[Pp]alavra-chave[:\s]*[*]*(\d{4})', 'i'))[1];
      IF keyword_text IS NULL THEN
        keyword_text := (regexp_match(ai_content, 'keyword[:\s]*[*]*(\d{4})', 'i'))[1];
      END IF;
      
      -- Extrair total com múltiplos padrões
      total_text := (regexp_match(ai_content, '[Tt]otal[^R]*R\$\s*([0-9]+(?:[.,][0-9]{1,2})?)', 'i'))[1];
      IF total_text IS NULL THEN
        total_text := (regexp_match(ai_content, 'R\$\s*([0-9]+(?:[.,][0-9]{1,2})?)', 'i'))[1];
      END IF;
      
      IF total_text IS NOT NULL THEN
        total_text := replace(total_text, ',', '.');
        total_value := CAST(total_text AS DECIMAL(10,2));
      END IF;
      
      -- Extrair endereço com múltiplos padrões
      address_text := (regexp_match(ai_content, '[Ee]ndereço[^:]*:\s*[*]*([^\n\r*]+)', 'i'))[1];
      IF address_text IS NULL THEN
        address_text := (regexp_match(ai_content, '[Aa]ddress[^:]*:\s*[*]*([^\n\r*]+)', 'i'))[1];
      END IF;
      IF address_text IS NOT NULL THEN
        address_text := trim(regexp_replace(address_text, '\*+', '', 'g'));
      END IF;
      
      -- Extrair forma de pagamento com múltiplos padrões
      payment_text := (regexp_match(ai_content, '[Pp]agamento[^:]*:\s*[*]*([^\n\r*]+)', 'i'))[1];
      IF payment_text IS NULL THEN
        payment_text := (regexp_match(ai_content, '[Pp]ayment[^:]*:\s*[*]*([^\n\r*]+)', 'i'))[1];
      END IF;
      IF payment_text IS NOT NULL THEN
        payment_text := trim(regexp_replace(payment_text, '\*+', '', 'g'));
      END IF;
      
      -- Criar itens genéricos baseados no total (estratégia mais simples)
      items_array := jsonb_build_array(jsonb_build_object(
        'name', 'Pedido de Açaí',
        'price', COALESCE(total_value, 0)
      ));
      
      -- Inserir pedido se temos dados essenciais (requisitos mínimos)
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
          
          RAISE NOTICE 'INSERIDO - Session: %, Keyword: %, Total: R$ %', 
            NEW.session_id, keyword_text, total_value;
            
        EXCEPTION WHEN unique_violation THEN
          RAISE NOTICE 'DUPLICADO - Keyword: %', keyword_text;
        WHEN OTHERS THEN
          RAISE NOTICE 'ERRO - Session: %, Erro: %', NEW.session_id, SQLERRM;
        END;
      ELSE
        RAISE NOTICE 'REJEITADO - Session: %, Keyword: %, Total: %', 
          NEW.session_id, keyword_text, total_value;
      END IF;
    ELSE
      -- Log para mensagens que não atendem aos critérios
      IF ai_content ~* 'palavra-chave' OR ai_content ~* 'total' OR ai_content ~* 'R\$' THEN
        RAISE NOTICE 'CRITERIO NAO ATENDIDO - Session: %, Conteudo: %', 
          NEW.session_id, substring(ai_content, 1, 100);
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Análise detalhada das mensagens existentes
DO $$
DECLARE
  existing_record RECORD;
  ai_content TEXT;
  keyword_text VARCHAR(10);
  total_text VARCHAR(20);
  total_value DECIMAL(10,2);
  address_text TEXT;
  payment_text VARCHAR(100);
  items_array JSONB := '[]'::jsonb;
  contador INTEGER := 0;
BEGIN
  -- Limpar tabela
  DELETE FROM public.pedidos_orders;
  
  RAISE NOTICE '=== INICIANDO ANÁLISE COMPLETA ===';
  
  -- Primeiro: mostrar todas as mensagens AI
  RAISE NOTICE 'Total de mensagens AI: %', (
    SELECT COUNT(*) FROM public.n8n_chat_histories 
    WHERE message->>'type' = 'ai'
  );
  
  -- Segundo: analisar mensagens que mencionam valores monetários
  FOR existing_record IN 
    SELECT * FROM public.n8n_chat_histories 
    WHERE message->>'type' = 'ai'
      AND (
        message->>'content' ~* 'R\$\s*\d+' OR
        message->>'content' ~* 'palavra-chave' OR
        message->>'content' ~* 'total'
      )
    ORDER BY id DESC
  LOOP
    contador := contador + 1;
    ai_content := existing_record.message->>'content';
    
    RAISE NOTICE '--- MENSAGEM % ---', contador;
    RAISE NOTICE 'ID: %, Session: %', existing_record.id, existing_record.session_id;
    RAISE NOTICE 'Conteúdo (primeiros 200 chars): %', substring(ai_content, 1, 200);
    
    -- Resetar variáveis
    keyword_text := NULL;
    total_text := NULL;
    total_value := NULL;
    address_text := NULL;
    payment_text := NULL;
    
    -- Tentar extrair palavra-chave
    keyword_text := (regexp_match(ai_content, '[Pp]alavra-chave[:\s]*[*]*(\d{4})', 'i'))[1];
    IF keyword_text IS NULL THEN
      keyword_text := (regexp_match(ai_content, 'keyword[:\s]*[*]*(\d{4})', 'i'))[1];
    END IF;
    
    -- Tentar extrair total
    total_text := (regexp_match(ai_content, '[Tt]otal[^R]*R\$\s*([0-9]+(?:[.,][0-9]{1,2})?)', 'i'))[1];
    IF total_text IS NULL THEN
      total_text := (regexp_match(ai_content, 'R\$\s*([0-9]+(?:[.,][0-9]{1,2})?)', 'i'))[1];
    END IF;
    
    IF total_text IS NOT NULL THEN
      total_text := replace(total_text, ',', '.');
      total_value := CAST(total_text AS DECIMAL(10,2));
    END IF;
    
    -- Extrair endereço
    address_text := (regexp_match(ai_content, '[Ee]ndereço[^:]*:\s*[*]*([^\n\r*]+)', 'i'))[1];
    IF address_text IS NOT NULL THEN
      address_text := trim(regexp_replace(address_text, '\*+', '', 'g'));
    END IF;
    
    -- Extrair pagamento
    payment_text := (regexp_match(ai_content, '[Pp]agamento[^:]*:\s*[*]*([^\n\r*]+)', 'i'))[1];
    IF payment_text IS NOT NULL THEN
      payment_text := trim(regexp_replace(payment_text, '\*+', '', 'g'));
    END IF;
    
    RAISE NOTICE 'Extrações: Keyword=%, Total=%, Endereço=%, Pagamento=%', 
      keyword_text, total_value, substring(COALESCE(address_text, 'NULL'), 1, 50), 
      substring(COALESCE(payment_text, 'NULL'), 1, 30);
    
    -- Verificar se atende critérios para inserção
    IF keyword_text IS NOT NULL AND total_value > 0 THEN
      items_array := jsonb_build_array(jsonb_build_object(
        'name', 'Pedido de Açaí',
        'price', total_value
      ));
      
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
        
        RAISE NOTICE '✅ INSERIDO COM SUCESSO!';
        
      EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE '⚠️ DUPLICADO (já existe)';
      WHEN OTHERS THEN
        RAISE NOTICE '❌ ERRO AO INSERIR: %', SQLERRM;
      END;
    ELSE
      RAISE NOTICE '❌ NÃO INSERIDO - critérios não atendidos';
    END IF;
    
    RAISE NOTICE ''; -- linha em branco
  END LOOP;
  
  -- Resultado final
  RAISE NOTICE '=== RESULTADO FINAL ===';
  RAISE NOTICE 'Mensagens analisadas: %', contador;
  RAISE NOTICE 'Pedidos inseridos: %', (SELECT COUNT(*) FROM public.pedidos_orders);
  
  -- Mostrar pedidos inseridos
  FOR existing_record IN 
    SELECT keyword, total, address, payment_method FROM public.pedidos_orders ORDER BY created_at
  LOOP
    RAISE NOTICE 'Pedido: Keyword=%, Total=R$%, Endereço=%, Pagamento=%', 
      existing_record.keyword, existing_record.total, 
      substring(existing_record.address, 1, 30), substring(existing_record.payment_method, 1, 20);
  END LOOP;
  
END $$;
