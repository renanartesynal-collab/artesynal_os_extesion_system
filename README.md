# Sistema Artesynal PCP (v2.1)

Sistema web de Planejamento e Controle de Produção integrado ao **Firebase Firestore** e **Cloudinary**.

## Estrutura de Pastas

```text
├── index.html                        # Painel Central (Entrada principal)
├── 404.html                          # Redirecionador automático para QR Codes antigos no GitHub Pages
├── manifest.json                     # Configuração PWA
├── sw.js                             # Service Worker PWA
├── assets/
│   ├── css/
│   │   └── theme.css                 # Design System global (Modo Escuro & Claro)
│   └── img/
│       ├── logo-artesynal.png        # Logotipo oficial ArteSynal
│       ├── icon-192.png              # Ícone PWA 192x192
│       └── icon-512.png              # Ícone PWA 512x512
├── js/
│   ├── core/
│   │   ├── config.js                 # Conexão Firebase, Cloudinary e Rotas
│   │   ├── auth.js                   # Autenticação e Permissões por Perfil
│   │   ├── theme.js                  # Controle de Tema e Notificações Toast
│   │   └── task-shortcut.js          # Foco automático em cartões via URL
│   ├── materiais/
│   │   ├── impressao.js              # Submódulo de Impressão (Mídias e Insumos)
│   │   ├── serralheria.js            # Submódulo de Serralheria (Chapas e Corte 2D)
│   │   └── estoque.js                # Submódulo de Estoque Geral
│   └── tarefas/
│       └── cards.js                  # Renderização e formulários dos cartões de tarefas
└── pages/
    ├── auth/
    │   ├── login.html                # Login e Solicitação de Acesso
    │   └── admin-acessos.html        # Gestão de Usuários e Permissões
    ├── os/
    │   └── os.html                   # Gerador de O.S. + Lista Mensal + Impressão A4
    ├── visitas/
    │   ├── medidas-visitas.html      # Quadro Kanban de Medidas e Visitas
    │   └── detalhes-visita.html      # Ficha Técnica, Fotos/Vídeos, Cotas e PDF
    ├── materiais/
    │   └── materiais.html            # Central Integrada (Impressão, Serralheria e Estoque)
    ├── pintura/
    │   └── pintura.html              # Setor de Pintura e Etiquetas Térmicas 55mm
    └── tarefas/
        └── tarefas.html              # Painel de Tarefas e Alertas de Compras
```
