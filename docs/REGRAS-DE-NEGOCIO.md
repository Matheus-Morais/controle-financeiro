# Regras de Negócio — Controle Financeiro

Documento de referência do domínio. Descreve **o que o sistema decide e por quê**, independente
de como está implementado. Serve para revisar mudanças, escrever testes e onboarding.

> Convenção: toda regra tem um identificador (`RN-XX`) para ser citada em PRs, testes e issues.
> Onde a implementação **hoje diverge** da regra, há um marcador ⚠️ com link para o plano de ajuste
> em [PLANO-DE-IMPLEMENTACAO.md](PLANO-DE-IMPLEMENTACAO.md).
>
> Os ajustes AJ-01 a AJ-26 do plano foram aplicados: não há divergências pendentes.

---

## 1. Glossário

| Termo | Definição |
|---|---|
| **Competência** (`reference_month`) | Mês ao qual um gasto pertence do ponto de vista da **fatura**. Sempre o 1º dia do mês (`YYYY-MM-01`). |
| **Fechamento** (`closing_day`) | Dia em que a fatura do cartão fecha e para de aceitar compras. |
| **Vencimento** (`due_day` / `due_date`) | Dia em que a fatura (ou a conta) precisa ser paga. |
| **Regime de competência** | Visão "em que fatura o gasto caiu". Base das telas de cartão e dos relatórios por categoria. |
| **Regime de caixa** | Visão "quanto sai do bolso neste mês". Base do topo do dashboard. |
| **Transação** (`transactions`) | O gasto como evento único (a compra). |
| **Parcela** (`installments`) | A ocorrência mensal de um gasto. É a unidade de todo cálculo mensal. |
| **Fatura** (`invoices`) | A "capa" de um `(cartão, competência)`: guarda fechamento, vencimento e se foi paga. |
| **Assinatura / Recorrente** (`recurring_expenses`) | *Template* de um gasto que se repete todo mês. Não é um gasto: gera gastos. |
| **Materialização** | Ato de criar a ocorrência concreta (transação + parcela) de uma assinatura num mês. |
| **Origem** | Cartão de crédito (`card_id`) **ou** conta/carteira (`account_id`). Nunca ambos. |

---

## 2. Invariantes do domínio

Regras que **nunca** podem ser violadas. Qualquer código que as quebre é bug, não escolha.

| ID | Invariante | Onde é garantido |
|---|---|---|
| **RN-01** | Dinheiro é **inteiro em centavos**. Nunca float. | Colunas `*_cents` (bigint); conversão só via [`money.ts`](../src/lib/money.ts) |
| **RN-02** | Competência é **sempre o 1º dia do mês** (`YYYY-MM-01`). | Colunas `reference_month` (date) + `toISO(y, m, 1)` |
| **RN-03** | Um gasto tem **exatamente uma origem**: cartão XOR conta. | `check ((card_id is null) <> (account_id is null))` em `transactions` e `recurring_expenses` |
| **RN-04** | A soma das parcelas é **exatamente** igual ao total da compra. | `generateInstallments` distribui a sobra 1 centavo por vez nas primeiras parcelas |
| **RN-05** | A lógica de datas de fatura é **pura e determinística** — sem `Date.now()`, sem timezone do ambiente. | [`invoice.ts`](../src/lib/invoice.ts), [`installments.ts`](../src/lib/installments.ts) |
| **RN-06** | **RLS é a barreira de segurança.** Todo acesso de usuário passa pelo client com sessão. | `createClient()`; `createServiceClient()` só no cron |
| **RN-07** | Relatórios ([`reports.ts`](../src/lib/reports.ts)) **sempre** recebem o client do usuário, nunca o service. | Assinatura `(db: DB, ...)` — o caller injeta |
| **RN-08** | Decisões de calendário usam o **timezone do usuário** (`profiles.timezone`), não o do servidor. | `todayISO(tz)`, `currentReferenceMonth(tz)`; o `tz` vem de [`user-time.ts`](../src/lib/user-time.ts) (`sessionTimezone` nas páginas, `userCurrentReferenceMonth` nas actions). Um teste de arquitetura barra chamadas sem argumento |
| **RN-09** | Competências **anteriores nunca são alteradas** por uma ação no mês corrente. | Escopo `>= fromMonth` nas exclusões; corte de ciclo na troca de cartão |
| **RN-10** | Mutações passam por **Server Action + validação Zod**. Não há API route de CRUD. | `actions.ts` por rota + [`schemas.ts`](../src/lib/schemas.ts) |

---

## 3. Cartões e ciclo de fatura

### RN-11 — Competência de uma compra
Dada a data da compra e o dia de fechamento do cartão:

```
dia da compra <= fechamento (limitado ao último dia do mês)  →  competência = mês da compra
dia da compra >  fechamento                                  →  competência = mês seguinte
```

O fechamento é **limitado ao último dia do mês** (`clampDay`): um cartão que fecha dia 31 fecha
dia 28 em fevereiro. Idem para o vencimento.

### RN-12 — Vencimento da fatura
```
due_day >  closing_day  →  vence no MESMO mês da competência
due_day <= closing_day  →  vence no mês SEGUINTE
```
É o comportamento padrão do mercado: fecha dia 25, vence dia 5 → vence no mês seguinte.

### RN-13 — Estado de exibição da fatura (regime de caixa)
| Estado | Condição |
|---|---|
| `paid` | `invoices.status = 'paid'` |
| `to_pay` | em aberto **e** `closing_date <= hoje` (já fechou, está no período de pagamento) |
| `forecast` | em aberto **e** `closing_date > hoje` (ainda acumulando, é previsão) |

Comparação lexicográfica sobre ISO — equivale à cronológica, sem `Date`.

**Fonte da verdade do pagamento.** `invoices.status` e `installments.status` são colunas
independentes, então é preciso dizer qual manda em cada origem:

| Origem | Fonte da verdade | Consequência |
|---|---|---|
| **Cartão** | a **fatura** (`invoices.status`) | `installments.status` de parcela de cartão não tem significado próprio. Quem lê (CSV, relatórios) deriva o status da parcela da fatura da competência dela — marcar a fatura como paga quita a competência inteira. |
| **Conta** | a **parcela** (`installments.status`) | Não há fatura; o toggle de "conta paga" é por parcela (RN-30). |

### RN-14 — Próxima fatura em aberto
Ao abrir um cartão sem mês explícito, o app mostra a **primeira competência ≥ mês corrente que não
esteja paga**. Faturas pagas são puladas (trava de segurança: no máximo 12 meses à frente).

### RN-15 — Compras à vista e em conta
Gastos com origem **conta** (PIX, dinheiro, débito, boleto) não têm ciclo de fatura. O sistema usa
`closing_day = 31` para eles, o que faz a competência sempre coincidir com o mês da compra.
Nesses casos a parcela guarda `due_date` (o vencimento da conta); em cartões `due_date` é `null` —
cartões usam a tabela `invoices`.

### RN-16 — Alteração do ciclo do cartão
Mudar `closing_day`/`due_day` **recalcula** `closing_date`/`due_date` de todas as faturas **em
aberto** do cartão (via `invoiceRefForMonth`), e o usuário é avisado de quantas foram ajustadas.
Faturas **pagas ficam como estão** (RN-09): foram quitadas nas datas antigas, e reescrevê-las
falsearia o histórico.

As competências das parcelas **não** são recalculadas — elas registram em que fatura a compra caiu
segundo o ciclo vigente na época.

---

## 4. Gastos e parcelamento

### RN-17 — Geração de parcelas
`N` parcelas ocupam `N` competências **consecutivas** a partir da competência da compra (RN-11).
O valor base é `floor(total / N)`; a sobra (`total - base*N`, sempre `< N`) é distribuída **1 centavo
por vez nas primeiras parcelas** — garantindo RN-04.

> Ex.: R$ 100,00 em 3× → `33,34 + 33,33 + 33,33`.

### RN-18 — Limites
- `installments_count` entre **1 e 72**. `kind = "installment"` exige ≥ 2.
- `amount_cents` deve ser **positivo** (> 0).
- Descrição: 1–120 caracteres.

### RN-19 — Edição de um gasto
Editar regenera **todas** as parcelas a partir dos novos dados, preservando **por competência** o
status `paid` **e** o `deleted_at` (soft-delete, RN-20) das parcelas antigas. Faturas já pagas
**não são reabertas** (`on conflict do nothing`).
Gastos `recurring` **não** são editáveis por essa tela — assinatura se edita em `/recorrentes`.

Toda a regeneração roda dentro de `update_expense_atomic` (uma transação no Postgres): sem isso, o
`delete` das parcelas antigas acontecia fora de qualquer transação e uma falha no `insert` seguinte
deixava o gasto **sem nenhuma parcela** — invisível em faturas e relatórios, mas com a transação
ainda existindo.

Encurtar um parcelamento pode descartar competências que estavam **pagas**. A função devolve
quantas foram, e a tela do cartão exibe o aviso — antes esse registro sumia em silêncio.

### RN-20 — Exclusão de gasto (soft-delete)
Excluir **não apaga** a parcela: marca `deleted_at`. A parcela sai de todos os totais mas continua
visível (esmaecida) na tela do cartão, preservando o histórico.

| Escopo | Efeito |
|---|---|
| `month` | só a competência exibida |
| `forward` | esta competência **e todas as seguintes** do mesmo gasto |

Competências **anteriores nunca são tocadas** (RN-09). A restauração (undo) é sempre por mês.

Para gastos recorrentes com escopo `forward`, além das parcelas: o template é **desativado**
(`active = false`) e recebe `end_month = mês anterior ao corte` — o cron para de materializar.

---

## 5. Assinaturas (gastos recorrentes)

### RN-21 — Template ≠ gasto
`recurring_expenses` é um *template*. Ele só vira dinheiro quando **materializado**: uma transação
`kind = "recurring"` + uma parcela única na competência.

### RN-22 — Vigência
Uma assinatura é materializada num mês quando:
```
active = true  AND  start_month <= mês  AND  (end_month IS NULL OR end_month >= mês)
```

### RN-23 — Competência de uma assinatura
**Diferente de uma compra avulsa**: a assinatura *sempre* entra na fatura do próprio mês, mesmo que
o `billing_day` caia depois do fechamento. O `billing_day` é apenas a data de referência da cobrança
(vira `purchase_date`), não o gatilho da competência.

### RN-24 — Idempotência da materialização
Uma assinatura está "já lançada no mês" quando existe **parcela na competência** ligada a ela — não
quando existe transação com `purchase_date` naquele mês. A distinção importa para ocorrências vindas
de importação de fatura, cuja data de compra é a impressa no PDF e pode cair no mês anterior.

**Parcela com soft-delete conta como lançada.** O usuário excluiu a ocorrência do mês de propósito;
recriá-la no próximo tick seria ressuscitar o que ele apagou.

### RN-25 — Quando a materialização acontece
| Gatilho | Escopo |
|---|---|
| Criação da assinatura | mês corrente |
| Cron do dia 1 | novo mês |
| Abertura da tela do cartão / contas / dashboard | mês navegado (fallback preguiçoso) |
| Troca de cartão | mês do corte |

### RN-26 — Troca de cartão de uma assinatura
Corte de ciclo, decidido pela pergunta "o mês atual já foi cobrado no cartão antigo?":

| Resposta | Corte | Efeito |
|---|---|---|
| **Sim** | mês seguinte | Mês atual permanece no cartão antigo (materializado antes da troca, se preciso). Novo cartão assume a partir do mês seguinte. |
| **Não** | mês atual | Ocorrência do mês atual é removida do cartão antigo e recriada no novo. |

Competências anteriores ao corte **permanecem no cartão antigo** — histórico preservado (RN-09).

---

## 6. Recebimentos (renda)

### RN-27 — Competência do recebimento
É o mês da `receipt_date`. Não há ciclo — entrada é sempre caixa do próprio mês.

### RN-28 — Modos de recorrência
| Modo | Regra |
|---|---|
| `day_of_month` | dia fixo do mês, limitado ao último dia (`clampDay`) |
| `nth_business_day` | N-ésimo **dia útil** do mês, recalculado a cada mês considerando fins de semana e feriados nacionais ([`business-days.ts`](../src/lib/business-days.ts)) |

### RN-29 — Materialização de renda recorrente
Feita por **cópia do mês anterior**: para cada recebimento marcado `is_recurring` em `mês-1`, cria o
equivalente em `mês` se ainda não existir.

A chave de deduplicação é `(description, amount_cents, recurring_mode)` — só a descrição não bastava:
duas rendas de mesmo nome na mesma competência colidiam e uma era perdida para sempre.

**Encerramento:** `incomes.recurring_end_month` é a **última competência** em que a renda se repete.
A partir daí a cópia para, e o valor acompanha as cópias (senão a recorrência reviveria no mês
seguinte). O botão "encerrar recorrência" em `/recebimentos` grava a competência do próprio registro,
que continua existindo. Apagar o recebimento do mês também quebra a corrente, mas é o caminho
destrutivo.

---

## 7. Contas fora do cartão

### RN-30 — Origem conta
PIX, dinheiro, débito, boleto e contas de consumo (luz, água) são lançados contra uma `account`.
Não geram `invoice`: o controle de pagamento é **por parcela** (`installments.status`).

### RN-31 — Vencimento da conta
`installments.due_date` recebe o dia da compra, ajustado ao mês de cada parcela (`clampDay`).
É o campo que alimenta o lembrete de contas a vencer.

### RN-32 — Exclusão de conta
Bloqueada enquanto houver transações ou assinaturas vinculadas — senão os gastos perderiam a origem.
O usuário precisa reatribuir ou excluir os lançamentos antes.

---

## 8. Fluxo de caixa e relatórios

### RN-33 — Dois regimes, dois lugares
| Visão | Regime | Agrupa por |
|---|---|---|
| Tela do cartão, gasto por categoria, total mensal | **competência** | `installments.reference_month` |
| Topo do dashboard ("a pagar no mês", "sobra") | **caixa** | `invoices.due_date` + parcelas sem cartão |

### RN-34 — Composição do mês (caixa)
```
a_pagar  = Σ faturas que VENCEM no mês  +  Σ gastos sem cartão com competência no mês
sobra    = recebimentos do mês  −  a_pagar
```
`a_pagar` inclui as faturas **já pagas** — o dinheiro saiu (ou sai) no mês. A distinção paga/a-pagar
fica no estado individual de cada fatura (RN-13).

### RN-35 — Total de uma fatura
Soma das parcelas com a chave `(card_id, reference_month)` **da própria fatura** — que no caso normal
é o mês *anterior* ao vencimento. Parcelas soft-deleted são excluídas do total.

### RN-36 — Orçamento
Limite mensal **recorrente** por categoria (`reference_month = null` = vale todo mês). Limite ≤ 0
remove o orçamento. O schema suporta orçamento por mês específico, mas a UI só expõe o recorrente.

A unicidade é garantida pelo banco: índice único em `(user_id, category_id, reference_month)` com
**`nulls not distinct`** — essencial porque `category_id` null é o orçamento *geral* e
`reference_month` null é o *recorrente*, justamente os casos que mais duplicavam. A gravação é
`upsert`, não read-then-write: dois cliques simultâneos criavam duas linhas, e o `maybeSingle()`
seguinte passava a quebrar.

---

## 9. Importação de fatura (PDF → IA → gastos)

### RN-37 — Papel da IA
A IA **só extrai e sugere**. Ela nunca grava: todo item passa pela tela de revisão, e toda a lógica
de valor, competência, categoria e dedupe é **determinística e testada** em
[`invoice-import.ts`](../src/lib/invoice-import.ts).

### RN-38 — Competência da fatura importada
Derivada do **vencimento impresso** + o ciclo do cartão (`referenceMonthFromDueDate`), não do mês do
vencimento. O vencimento é o campo mais confiável do PDF. A competência é **forçada para o lote inteiro**.

### RN-39 — O que entra como gasto
| `tipo` extraído | Entra? |
|---|---|
| `compra`, `encargo`, `outro` | ✅ |
| `credito` (estorno) | ❌ |
| `pagamento` (pagamento da fatura anterior) | ❌ |

### RN-40 — Reconciliação
A soma dos lançamentos extraídos deve bater com o **total impresso** da fatura, com tolerância de
**R$ 1,00**. É a principal guarda contra alucinação/omissão da IA. Sem total impresso, não há checagem.

### RN-41 — Deduplicação (3 níveis, em ordem de confiança)
1. **Chave exata** — `nome bruto + valor + data`, **na competência importada**. Cobre o reimport do
   mesmo PDF.
2. **Parcelado** — mesma assinatura `nome-sem-contador + valor da parcela + total de parcelas`, em
   **qualquer mês do cartão**. Cobre subir a fatura do mês seguinte: as parcelas futuras já foram
   materializadas em competências posteriores.
3. **Recorrente** — ocorrência da competência ligada a uma assinatura cujo nome bate (por nome
   amigável, nome bruto ou *apelido* já visto em faturas anteriores). Valor e data **não** entram:
   assinatura reajusta, e a data materializada pelo cron é o `billing_day`, não a data do PDF.

O nome usado na dedupe é sempre o **bruto** (`statement_description`), nunca o amigável — que o
usuário pode editar.

### RN-42 — Propagação de parcelas na importação
Um item `3/10` cria a parcela 3 na competência forçada e **propaga as parcelas 4–10** para as
competências seguintes. As parcelas 1–2 **não** são criadas: pertencem a faturas passadas.

### RN-43 — Item marcado como recorrente
Vira um template + uma transação `kind = "recurring"` na própria fatura. **Recorrência vence parcela**
(assinatura não é parcelamento). O template começa no **mês seguinte** — a fatura importada já traz a
ocorrência do mês corrente, e o cron materializa daí em diante sem duplicar.
Se a revisão casar o item com uma assinatura **já cadastrada**, reaproveita esse template em vez de
criar um duplicado.

### RN-44 — Isolamento referencial (todos os fluxos)
Todo id de FK vindo de um payload (`card_id`, `account_id`, `category_id`, `recurring_id`) é validado
contra os registros **do próprio usuário** antes de gravar — a RLS não valida integridade de FK.
Três camadas, todas ativas:

1. **Server Action** — [`ownership.ts`](../src/lib/ownership.ts) (`assertOwned`), nos fluxos que não
   passam por uma função atômica (criar assinatura, lançar/editar gasto).
2. **Função Postgres** — `assert_owned_refs` roda dentro de `create_expense_atomic`,
   `update_expense_atomic` e `import_invoice_atomic`; elas também **ignoram** o `user_id` enviado
   pelo client e usam `auth.uid()`.
3. **Banco** — FKs **compostas** `(fk_id, user_id) → (id, user_id)` (migration 0011): o vínculo
   cross-tenant é impossível, independentemente do código da aplicação.

### RN-45 — Privacidade do PDF
A fatura é PII. O PDF **não é persistido**, o conteúdo **nunca é logado** (nem em erro) e a resposta
usa `Cache-Control: no-store`. Instruções que apareçam dentro do PDF são tratadas como **dados**,
nunca como comando (defesa contra prompt injection declarada no system prompt).

O mesmo tratamento vale para o **export CSV**, que carrega o histórico financeiro completo:
`Cache-Control: no-store, no-cache, must-revalidate, private`.

### RN-55 — Quota da importação por IA
`/api/faturas/importar` é o único endpoint com **custo marginal por request**. O limite é por usuário
— **10/hora** e **30/dia** — contado em `invoice_import_log` (no banco, porque a função é serverless
e não há memória compartilhada). Exceder devolve `429` com `Retry-After`.

A quota é consumida **antes** da chamada ao modelo: uma extração que falha no meio já custou tokens.
O usuário tem policy de `select`/`insert` no log, mas **nenhuma** de `update`/`delete` — não dá para
zerar a própria quota.

---

## 10. Notificações

### RN-46 — Tipos e gatilhos
| Tipo | Quando | Condição |
|---|---|---|
| `monthly` | dia 1 do mês (TZ do usuário) | `monthly_reminder_enabled` **e** existe fatura em aberto |
| `bills` | diariamente | contas com `due_date` nos próximos **3 dias**, em aberto |
| `weekly` | dia da semana configurado | `weekly_reminder_enabled` |

### RN-47 — Idempotência
Antes de enviar, o sistema **reivindica** (`claim`) o envio inserindo em `notification_log`
(`unique (user_id, type, sent_for)`). O desfecho é **tri-estado**:

| Resultado | Significado | Ação |
|---|---|---|
| sem erro | a reivindicação é nossa | envia |
| erro `23505` | `unique_violation` — já enviado hoje | pula, sem log |
| qualquer outro erro | falha de infra (timeout, conexão, permissão) | loga e conta em `failed` |

Tratar tudo como conflito descartava o lembrete do dia em silêncio — e, como o cron roda 1×/dia,
ele se perdia para sempre.

**Retenção:** o log só serve para dedupe de curto prazo; cada tick apaga registros com `sent_for`
mais antigo que **90 dias**.

### RN-56 — Resiliência e observabilidade do tick
A falha de um usuário **não aborta** os demais (cada iteração é isolada). A resposta devolve
`{ ok, sent, failed, materialized, processed }`, e o status vira **500** quando a taxa de erro é
anômala (metade ou mais dos usuários processados) — assim o monitor da plataforma acusa. Foi
justamente a ausência desse sinal que deixou o cron quebrado passar despercebido.

### RN-48 — Higiene de subscriptions
Endpoint que responde **404/410** é removido do banco na hora (subscription expirada).

### RN-49 — Autorização do cron
`/api/cron/notifications` exige `Authorization: Bearer $CRON_SECRET`. Sem `CRON_SECRET` configurado,
a rota **recusa tudo** (fail-closed).

O `matcher` do middleware **exclui `/api`**: cada rota de API faz a própria autorização e nenhuma
precisa de renovação de cookie. Sem essa exclusão, a requisição do cron — que não carrega cookie de
sessão — era redirecionada para `/login` com `307` **antes** de a rota checar o segredo, e nenhum
push era enviado. Um teste trava o matcher contra regressão.

---

## 11. Conta do usuário

### RN-50 — Provisionamento
Todo usuário novo recebe, por trigger em `auth.users`: profile, a conta **"Carteira"** padrão e
**18 categorias** semeadas.

### RN-51 — Onboarding
Quem se cadastra a partir da introdução do wizard recebe `user_metadata.onboarding_pending = true` e
é redirecionado para `/onboarding` até concluir ou pular. Usuários anteriores **não têm a chave** e
seguem direto — a ausência é o sinal de "não se aplica".

### RN-52 — Reiniciar conta (soft reset)
Apaga todos os registros e configurações e **re-semeia** os dados padrão. Login e profile permanecem.
Roda como uma única função Postgres `security invoker` — a RLS garante o escopo e a transação
garante atomicidade. Exige digitar `REINICIAR CONTA`.

### RN-53 — Excluir conta
Remove o usuário do Supabase Auth; o `on delete cascade` até `auth.users` limpa todo o banco.
Irreversível. Exige digitar `EXCLUIR CONTA`.

### RN-54 — Mensagens de autenticação são genéricas
Login, recuperação de senha **e cadastro** devolvem sempre uma mensagem genérica, independente de o
e-mail existir. O erro cru do Supabase no `signUp` ("User already registered") permitia enumerar
quais e-mails têm conta; o detalhe agora fica só no log do servidor. O `signUp` também exige a mesma
senha mínima de 6 caracteres do `updatePassword`.

---

## 12. Modelo de segurança

| Camada | Responsabilidade |
|---|---|
| **Middleware** | Renova a sessão Supabase e redireciona não-autenticado para `/login`. **Não** é a barreira de autorização. |
| **RLS (Postgres)** | A barreira real. Toda tabela tem `user_id = auth.uid()` para `select/insert/update/delete`. |
| **Server Action** | Valida entrada (Zod) e re-checa a sessão. Defesa em profundidade. |
| **Service role** | Só o cron e a exclusão de conta. Ignora RLS — nunca pode chegar ao browser. |

| **Cabeçalhos HTTP** | CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options` em todas as rotas ([`next.config.mjs`](../next.config.mjs)). `CSP_REPORT_ONLY=1` permite validar a política sem bloquear. |

### Fronteiras que a RLS **não** cobre

Cada uma tem hoje uma defesa própria — a RLS sozinha não resolveria nenhuma:

- **Integridade referencial cross-tenant.** A RLS aprova um `insert` cujo `category_id` aponta para a
  categoria de outro usuário — a policy só olha o `user_id` da linha inserida. Coberto pelas três
  camadas de RN-44 (validação na action, na função Postgres e FK composta no banco).
- **Atomicidade.** Sequências de `insert` em várias tabelas via PostgREST não são uma transação. Os
  três fluxos de gravação (lançar, editar, importar) passam por funções Postgres `security invoker`
  (migration 0010) — a RLS continua valendo e a função inteira roda numa transação. Mesmo padrão de
  `reset_account_data()` (RN-52).
- **Custo e abuso.** A RLS não limita quantas vezes um usuário legítimo chama um endpoint caro.
  Coberto pela quota de RN-55.
- **Falha silenciosa de mutação.** Sem sessão, `auth.uid()` é null e a RLS simplesmente não afeta
  nenhuma linha — a operação "passa" sem erro. Toda Server Action de mutação checa a sessão, escopa
  a query por `user_id` e devolve `{ error }`; a UI desfaz a atualização otimista em vez de exibir
  sucesso sobre algo que não aconteceu.

---

## 13. Regras que o produto **não** implementa (decisões explícitas)

Registradas para não serem "descobertas" como bug:

- **Sem multi-moeda.** `profiles.currency` existe mas é sempre `BRL`.
- **Sem alerta de limite.** `credit_limit_cents` alimenta o "limite disponível" na tela do cartão
  (teto − parcelas vivas das faturas ainda em aberto), mas o app **não** bloqueia nem avisa ao
  estourar o limite.
- **Sem conciliação bancária / Open Finance.** Toda entrada é manual ou via PDF de fatura.
- **Sem saldo de conta.** `accounts` é forma de pagamento, não carteira com saldo.
- **Sem compartilhamento.** Uma conta = um usuário. Não há orçamento familiar.
- **Sem parcelamento de fatura** (rolar saldo devedor com juros).
- **Orçamento só recorrente** na UI, embora o schema suporte por mês (RN-36).
