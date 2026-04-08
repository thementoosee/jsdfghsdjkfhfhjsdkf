# Overlays Fever

Sistema de gestão de overlays para streaming com integração Supabase.

## Setup Local

### 1. Instalar Dependências

```bash
npm install
```

### 2. Configurar Variáveis de Ambiente

Cria um ficheiro `.env` na raiz do projeto (copia do `.env.example`):

```bash
cp .env.example .env
```

Edita o ficheiro `.env` e adiciona as tuas credenciais do Supabase:

```env
VITE_SUPABASE_URL=https://teu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=tua_chave_anon_aqui
```

**Como obter as credenciais:**
1. Vai a [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Seleciona o teu projeto
3. Vai a **Settings > API**
4. Copia o **Project URL** para `VITE_SUPABASE_URL`
5. Copia a chave **anon public** para `VITE_SUPABASE_ANON_KEY`

### 3. Executar Migrações da Base de Dados

Se estás a usar um projeto Supabase novo, tens de executar as migrações na pasta `supabase/migrations/`.

Podes fazê-lo de duas formas:

**Opção A: Supabase CLI (Recomendado)**
```bash
# Instalar Supabase CLI
npm install -g supabase

# Login
supabase login

# Link ao projeto
supabase link --project-ref teu-project-ref

# Executar migrações
supabase db push
```

**Opção B: Supabase Dashboard**
1. Vai ao teu projeto no Supabase Dashboard
2. Vai a **SQL Editor**
3. Copia e cola o conteúdo de cada ficheiro `.sql` da pasta `supabase/migrations/` (por ordem de data)
4. Executa cada um

### 4. Arrancar o Servidor de Desenvolvimento

```bash
npm run dev
```

O projeto vai estar disponível em `http://localhost:5173`

## Problemas Comuns

### Ecrã Branco / Não Carrega Nada

**Causas possíveis:**

1. **Ficheiro `.env` em falta ou incorreto**
   - Verifica que tens o ficheiro `.env` na raiz
   - Confirma que as credenciais estão corretas
   - Abre as Developer Tools do browser (F12) e verifica a consola para erros

2. **Base de dados sem migrações**
   - As tabelas não existem na base de dados
   - Executa as migrações como descrito acima

3. **Dependências não instaladas**
   - Corre `npm install` novamente

4. **Cache do browser**
   - Limpa a cache do browser (Ctrl+Shift+Delete)
   - Ou usa modo incógnito

5. **Porta já em uso**
   - Se a porta 5173 já está a ser usada, o Vite vai usar outra porta
   - Verifica o terminal para ver qual porta está a ser usada

### Como Verificar se Está a Funcionar

Abre as Developer Tools (F12) no browser e verifica:

1. **Console** - Não deve ter erros a vermelho sobre Supabase
2. **Network** - Deve mostrar chamadas ao Supabase (filtrar por "supabase.co")
3. **Application > Local Storage** - Deve ter as chaves do Supabase

## Build para Produção

```bash
npm run build
```

Os ficheiros compilados ficam na pasta `dist/`

## Tecnologias

- React + TypeScript
- Vite
- Tailwind CSS
- Supabase (Base de dados + Realtime)
- Lucide React (Ícones)
