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

## Publicando no GitHub e GitHub Pages

Após enviar ou sincronizar este projeto no repositório GitHub (por exemplo, `https://github.com/vibetech-cmd/4ever-management`):

1. **GitHub Pages (Importante — não use `Deploy from a branch: main / root`):**
   - Este projeto usa **React + TypeScript + Vite**, portanto o navegador não executa os arquivos de `src/` sem antes gerar o build (`npm run build`).
   - No GitHub, acesse **Settings → Pages → Build and deployment → Source** e selecione **GitHub Actions** (o workflow `.github/workflows/deploy.yml` já incluído no projeto compilará e publicará a pasta `dist/` automaticamente a cada push na branch `main`).
2. **Firebase Authentication:**
   - Acesse **Firebase Console → Authentication → Settings → Authorized domains** e adicione `vibetech-cmd.github.io` para liberar o login na URL do GitHub Pages.

Caso envie manualmente pelo terminal:

```bash
git init
git add .
git commit -m "chore: 4EVER Management"
git branch -M main
git remote add origin https://github.com/vibetech-cmd/4ever-management.git
git push -u origin main
```

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
