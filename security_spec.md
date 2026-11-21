# Especificação de Segurança — 4EVER Management (Phase 0 TDD)

## 1. Invariantes de Dados
1. **Acesso Interno Restrito**: Nenhum usuário não autenticado ou sem e-mail verificado (`request.auth.token.email_verified == true`) pode ler ou gravar qualquer documento. Usuários autenticados que não sejam o Administrador Master inicial (`cleisson.md@gmail.com`) nem possuam perfil `ACTIVE` em `/users/{uid}` não podem ler nem escrever dados operacionais.
2. **Isolamento de PII (`/users/{userId}`)**: Dados pessoais e permissões em `/users/{userId}` só podem ser lidos pelo próprio titular (`request.auth.uid == userId`) ou por administradores (`MASTER_ADMIN` / `OPERATIONAL_ADMIN`).
3. **Integridade de Papéis (Anti-Escalação de Privilégio)**: Um usuário comum jamais pode alterar seu próprio campo `role` ou `permissions` em `/users/{uid}`, nem criar um documento `/users/{uid}` autoproclamando-se `MASTER_ADMIN`.
4. **Master Gate em Subcoleções**:
   - `/quotes/{quoteId}/versions/{versionId}` só pode ser criada/lida se `/quotes/{quoteId}` existir. Versões históricas são imutáveis após criação (`allow update, delete: if false` ou restrito a Master).
   - `/events/{eventId}/tasks/{taskId}` e `/events/{eventId}/timeline/{itemId}` exigem que `/events/{eventId}` exista.
5. **Integridade Referencial**:
   - `/contracts/{contractId}` exige que `/events/{eventId}` exista na criação.
   - `/installments/{installmentId}` exige que `/contracts/{contractId}` e `/events/{eventId}` existam na criação.
6. **Imutabilidade de Auditoria**: `/auditLogs/{logId}` é estritamente append-only (`allow update, delete: if false`).
7. **Campos Imutáveis e Timestamps do Servidor**: `createdAt` é imutável após criação e validado contra `request.time` na criação (`createdAt == request.time`, `updatedAt == request.time`). `createdBy` é validado contra `request.auth.uid` na criação e imutável em updates.
8. **List Queries Seguras (Sem `get()` em `allow list`)**: Todas as regras `allow list` verificam `resource.data.authorizedUids` contra `request.auth.uid` (ou e-mail Master verificado) sem executar lookups `get()`/`exists()`.

## 2. "Dirty Dozen" Payloads (Casos de Ataque que DEVEM retornar PERMISSION_DENIED)
1. **Unauthenticated Read**: Usuário sem `request.auth` tentando ler `/events` ou `/quotes`.
2. **Unverified Email Admin Spoof**: Usuário com `email: "cleisson.md@gmail.com"` e `email_verified: false` tentando ler `/systemConfig/main`.
3. **Self-Privilege Escalation on Create**: Usuário novo tentando criar `/users/{uid}` com `role: "MASTER_ADMIN"`.
4. **Role Tampering on Update**: Integrante (`MEMBER`) tentando atualizar `/users/{uid}` alterando `role` para `"MASTER_ADMIN"`.
5. **Shadow Field Injection**: Usuário autenticado enviando um campo oculto `"isSuperUser": true` na criação de `/quotes/{quoteId}`.
6. **ID Poisoning (1.5KB Document ID)**: Tentativa de criar `/events/{1500_char_id}` violando `isValidId()`.
7. **Author Spoofing**: Usuário `uid_A` tentando criar `/quotes/{id}` com `createdBy: "uid_B"`.
8. **Timestamp Forgery**: Usuário tentando criar `/events/{id}` com `createdAt` retroativo diferente de `request.time`.
9. **Orphaned Subcollection Write**: Tentativa de criar `/events/nonexistent_evt/tasks/task_1` sem evento pai existente.
10. **Audit Log Tampering**: Até mesmo usuário autenticado tentando atualizar ou apagar `/auditLogs/{logId}`.
11. **Viewer Write Attempt**: Usuário com perfil `VIEWER` tentando criar ou editar um orçamento ou despesa.
12. **Blanket List Scraping**: Usuário externo autenticado tentando `list` em `/quotes` sem pertencer a `authorizedUids`.
