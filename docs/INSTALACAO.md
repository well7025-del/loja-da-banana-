# Instalar o Loja da Banana no celular

O ERP tem **duas partes**. Vale entender isso antes de começar, porque é a
causa de quase toda dúvida na instalação:

| Parte | O que é | Onde fica |
|---|---|---|
| **Servidor** | Onde os dados moram: estoque, vendas, produção, financeiro | Um computador ligado (na empresa ou na nuvem) |
| **Aplicativo** | O que você abre no celular | Em cada celular da equipe |

O aplicativo **não guarda os dados**. Ele conversa com o servidor. Por isso:

- Se o servidor estiver desligado, o app mostra "sem conexão".
- Todo mundo vê a mesma informação, atualizada na hora.
- Trocar de celular não perde nada.

---

## Parte 1 — Deixar o servidor no ar

### Opção A: um computador da empresa (mais simples e sem custo)

Serve quando a equipe usa o sistema **dentro do Wi-Fi da empresa**.

1. Instale o [Docker Desktop](https://www.docker.com/products/docker-desktop/) no computador.
2. Baixe o projeto e, na pasta dele, copie `.env.example` para `.env`.
3. No `.env`, troque a `AUTH_SECRET` por um valor aleatório e longo, e a
   `POSTGRES_PASSWORD` por uma senha sua:

   ```
   AUTH_SECRET=cole-aqui-uma-sequencia-aleatoria-de-40-caracteres
   POSTGRES_PASSWORD=uma-senha-forte
   ```

4. Abra o terminal na pasta e rode:

   ```bash
   docker compose up -d
   ```

5. Descubra o endereço do computador na rede:

   - **Windows:** `ipconfig` → procure "Endereço IPv4" (algo como `192.168.0.10`)
   - **Mac/Linux:** `hostname -I` ou `ifconfig`

   O endereço do servidor será **`192.168.0.10:3000`** (troque pelo seu IP).

6. Teste pelo navegador do próprio computador: `http://localhost:3000`

**Limites desta opção:** só funciona dentro do Wi-Fi da empresa, e o
computador precisa ficar ligado. Fixe o IP do computador no roteador, senão
ele pode mudar e o app "perde" o servidor.

### Opção B: na nuvem (acesso de qualquer lugar)

Vale quando a equipe precisa usar o sistema fora da empresa — representantes,
entregas, o dono acompanhando de casa.

Contrate uma VPS simples (qualquer provedor, a partir de uns R$ 30/mês),
instale o Docker e rode o mesmo `docker compose up -d`. Depois aponte um
domínio para o servidor e coloque HTTPS na frente (Caddy ou Nginx resolvem em
poucas linhas).

O endereço do servidor passa a ser o domínio: `erp.lojadabanana.com.br`.

> **Use HTTPS sempre que o sistema estiver acessível pela internet.** Sem ele,
> as senhas trafegam em texto claro. Dentro do Wi-Fi da empresa o HTTP é
> aceitável; exposto na internet, não.

---

## Parte 2 — Instalar o aplicativo no celular

### Como gerar o instalador (APK)

O APK é compilado automaticamente pelo GitHub:

1. Abra o repositório no GitHub → aba **Actions**
2. Na lista à esquerda, clique em **"Gerar APK do aplicativo"**
3. Botão **"Run workflow"** → confirme
4. Espere uns 3 minutos. Ao terminar, abra a execução e baixe o arquivo em
   **Artifacts → loja-da-banana-apk**

Você recebe um `.zip`; dentro dele está o `loja-da-banana-1.0.0.apk`.

### Como instalar no celular

1. Envie o `.apk` para o celular (WhatsApp, e-mail, cabo USB, Google Drive).
2. Toque no arquivo. O Android vai avisar que o app não veio da Play Store —
   é esperado, por ser um aplicativo interno da empresa.
3. Toque em **Configurações** no aviso e permita **"Instalar apps
   desconhecidos"** para o app que está abrindo o arquivo (WhatsApp, Arquivos
   ou Chrome, conforme o caso).
4. Volte e confirme a instalação.

### Primeiro uso

Ao abrir, o app pede o **endereço do servidor**. Digite o que você anotou na
Parte 1:

- Rede da empresa: `192.168.0.10:3000`
- Domínio próprio: `erp.lojadabanana.com.br`

O app testa a conexão antes de salvar — se o endereço estiver errado ou o
servidor desligado, ele avisa na hora em vez de deixar você na mão depois.

Depois é só entrar com seu e-mail e senha. O endereço fica guardado; nas
próximas vezes o app abre direto no sistema.

**Para trocar o endereço depois** (mudou o IP, migrou para a nuvem): quando o
app mostrar a tela de "sem conexão", toque em **Alterar endereço**.

---

## Alternativa sem APK: instalar como atalho (PWA)

Se preferir não lidar com arquivo `.apk`, dá para instalar direto do navegador:

1. Abra o endereço do servidor no **Chrome** do celular
2. Menu (⋮) → **Adicionar à tela inicial**

Funciona praticamente igual: ícone próprio, tela cheia, sem barra de
navegador. O APK só é melhor em dois pontos: é mais fácil de distribuir para a
equipe (manda o arquivo pelo WhatsApp) e a leitura de código de barras pela
câmera é mais confiável.

---

## Assinatura do app (recomendado antes de distribuir para a equipe)

Sem configuração, o workflow gera um APK **de teste**. Ele instala e funciona,
mas tem um incômodo: **cada nova versão exige desinstalar a anterior**, porque
a assinatura muda a cada compilação.

Para resolver, crie **uma chave sua** e guarde-a no GitHub. Aí as atualizações
instalam por cima, preservando tudo.

1. No seu computador, com Java instalado:

   ```bash
   keytool -genkeypair -v \
     -keystore loja-da-banana.jks \
     -alias loja-da-banana \
     -keyalg RSA -keysize 2048 -validity 10000
   ```

   Ele pede uma senha e alguns dados. **Guarde o arquivo `.jks` e a senha em
   lugar seguro** — sem eles você não consegue mais atualizar o app instalado.

2. Converta o arquivo para texto:

   ```bash
   base64 -w0 loja-da-banana.jks > chave.txt     # Linux
   base64 -i loja-da-banana.jks | tr -d '\n' > chave.txt   # Mac
   ```

3. No GitHub: **Settings → Secrets and variables → Actions → New repository
   secret**. Crie quatro:

   | Nome | Valor |
   |---|---|
   | `KEYSTORE_BASE64` | todo o conteúdo de `chave.txt` |
   | `KEYSTORE_PASSWORD` | a senha do keystore |
   | `KEY_ALIAS` | `loja-da-banana` |
   | `KEY_PASSWORD` | a senha da chave (normalmente a mesma) |

4. Rode o workflow de novo. A partir daí o APK sai assinado com a sua chave.

---

## Problemas comuns

**"Não foi possível falar com o servidor"**
O celular está em outro Wi-Fi, o computador do servidor está desligado, ou o
IP mudou. Confira o IP (`ipconfig`) e teste pelo navegador do celular antes.

**Funcionava e parou depois de reiniciar o computador**
O IP do computador mudou. Fixe o IP no roteador (reserva de DHCP) ou atualize
o endereço no app.

**O Android bloqueia a instalação**
Precisa autorizar "Instalar apps desconhecidos" para o aplicativo que está
abrindo o arquivo. É uma permissão por app, não geral.

**A câmera não lê o código de barras**
Autorize o acesso à câmera quando o app pedir. Se negou antes: Configurações
do Android → Apps → Loja da Banana → Permissões → Câmera.

**Preciso atualizar o sistema (não o app)**
Atualize só o servidor: `git pull && docker compose up -d --build`. Os
celulares pegam a versão nova sozinhos, sem reinstalar nada.
