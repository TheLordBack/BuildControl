# BuildControl

PWA mobile-first para controlar materiais e dinheiro guardado para a obra.

## Integração preservada

O frontend utiliza a API já publicada em:

`https://buildcontrol-api.vercel.app`

Rotas usadas:

- `POST /api/cadastro`
- `POST /api/login`
- `GET /api/dados`
- `POST /api/dados`

A sessão continua salva em `buildcontrol_session` e o usuário em `buildcontrol_user`.
Os dados também mantêm backup local nas chaves `buildcontrol_materiais` e `buildcontrol_guardados`.

## Arquivos principais

- `index.html`: aplicativo principal
- `login.html`: login e cadastro
- `style.css`: interface responsiva
- `script.js`: materiais, valores, relatórios, sincronização e PWA
- `login.js`: autenticação pela API
- `manifest.json` e `sw.js`: instalação e funcionamento offline

## Publicação

Envie os arquivos para o mesmo projeto/repositório atual e publique novamente na Vercel.
