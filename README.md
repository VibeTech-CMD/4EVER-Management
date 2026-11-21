# 4EVER Management

Plataforma interna de gestão operacional, comercial e financeira da **4EVER Assessoria e Cerimonial**.

## Arquitetura e Tecnologias

- **Frontend**: React 19 + TypeScript + Tailwind CSS v4 + Vite
- **Backend / Servidor**: Node.js + Express (`server.ts`, porta `3000`)
- **Persistência & Autenticação**: Firebase Authentication + Cloud Firestore + Firebase Storage (`firebase-applet-config.json`)
- **Geração de PDF**: `pdf-lib` (comprovantes financeiros de pagamento; emissão de propostas sobre modelo oficial pausada temporariamente para ajustes futuros)

## Segurança e Versionamento (GitHub)

- Nenhum arquivo operacional de clientes, fotos, comprovantes, contratos ou exportações privadas deve ser versionado no GitHub (`.gitignore` já configurado).
- Os uploads reais dos usuários são armazenados exclusivamente no **Firebase Storage** e seus metadados no **Cloud Firestore**.
- Utilize o botão **Exportar Backup JSON** em `Configuração Geral` sempre que desejar gerar uma cópia portátil dos dados operacionais.

## Publicando no GitHub

Após baixar ou exportar o código-fonte do projeto para sua máquina:

```bash
git init
git add .
git commit -m "chore: 4EVER Management"
git branch -M main
git remote add origin https://github.com/vibetech-cmd/4ever-management.git
git push -u origin main
```

*(Crie o repositório `4ever-management` na sua conta GitHub antes de executar o `git push`.)*

## Execução Local

```bash
npm install
npm run dev
```

## Build e Publicação (Hostinger / Node.js ou Estático)

```bash
npm run build
npm run start
```

- **Hospedagem Node.js (Hostinger VPS / Cloud)**: utilize `npm run build` seguido de `npm run start` (`tsx server.ts` na porta `3000`).
- **Hospedagem Estática (Hostinger Web Hosting / `public_html`)**: após `npm run build`, publique o conteúdo gerado na pasta `dist/` e configure o redirecionamento SPA para `index.html`.
- **Firebase Console**: certifique-se de adicionar o domínio final em *Authentication → Settings → Authorized domains*, habilitar os provedores *Google* e *E-mail/Senha*, e ativar o bucket do *Firebase Storage*.
