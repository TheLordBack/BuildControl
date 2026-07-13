const API_BASE_URL = "https://buildcontrol-api.vercel.app";

document.addEventListener("DOMContentLoaded", () => {
  let modoCadastro = false;
  const $ = id => document.getElementById(id);
  const tabLogin = $("tabLogin");
  const tabCadastro = $("tabCadastro");
  const authForm = $("authForm");
  const campoNome = $("campoNome");
  const nomeUsuario = $("nomeUsuario");
  const emailUsuario = $("emailUsuario");
  const senhaUsuario = $("senhaUsuario");
  const btnAuth = $("btnAuth");
  const authMensagem = $("authMensagem");

  try {
    const sessao = JSON.parse(localStorage.getItem("buildcontrol_session"));
    if (sessao?.access_token) window.location.replace("index.html");
  } catch {}

  function mensagem(texto, tipo = "") {
    authMensagem.textContent = texto;
    authMensagem.className = `auth-message ${tipo}`;
  }

  function atualizarTela() {
    tabLogin.classList.toggle("active", !modoCadastro);
    tabCadastro.classList.toggle("active", modoCadastro);
    campoNome.classList.toggle("hidden", !modoCadastro);
    $("authTitulo").textContent = modoCadastro ? "Crie sua conta" : "Acesse sua conta";
    $("authSubtitulo").textContent = modoCadastro ? "Comece agora a organizar sua obra." : "Entre para continuar acompanhando sua obra.";
    btnAuth.textContent = modoCadastro ? "Criar conta" : "Entrar";
    senhaUsuario.autocomplete = modoCadastro ? "new-password" : "current-password";
    mensagem("");
  }

  tabLogin.addEventListener("click", () => { modoCadastro = false; atualizarTela(); });
  tabCadastro.addEventListener("click", () => { modoCadastro = true; atualizarTela(); });

  authForm.addEventListener("submit", async event => {
    event.preventDefault();
    const nome = nomeUsuario.value.trim();
    const email = emailUsuario.value.trim();
    const senha = senhaUsuario.value;
    if (!email || !senha) return mensagem("Preencha email e senha.", "erro");
    if (modoCadastro && !nome) return mensagem("Informe seu nome.", "erro");
    if (senha.length < 6) return mensagem("A senha precisa ter pelo menos 6 caracteres.", "erro");
    btnAuth.disabled = true;
    btnAuth.textContent = modoCadastro ? "Criando conta..." : "Entrando...";
    mensagem("Conectando...");
    try {
      const endpoint = modoCadastro ? "/api/cadastro" : "/api/login";
      const resposta = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, email, senha })
      });
      const texto = await resposta.text();
      let resultado = {};
      try { resultado = texto ? JSON.parse(texto) : {}; } catch { resultado = { erro: texto }; }
      if (!resposta.ok) throw new Error(resultado.erro || "Não foi possível concluir.");
      if (modoCadastro) {
        modoCadastro = false;
        atualizarTela();
        nomeUsuario.value = "";
        senhaUsuario.value = "";
        mensagem("Conta criada. Agora entre com email e senha.", "sucesso");
        return;
      }
      if (!resultado.session?.access_token) throw new Error("A API não retornou uma sessão válida.");
      localStorage.setItem("buildcontrol_session", JSON.stringify(resultado.session));
      localStorage.setItem("buildcontrol_user", JSON.stringify(resultado.usuario || { nome, email }));
      window.location.replace("index.html");
    } catch (erro) {
      console.error(erro);
      mensagem(erro.message || "Erro de conexão com a API.", "erro");
    } finally {
      btnAuth.disabled = false;
      btnAuth.textContent = modoCadastro ? "Criar conta" : "Entrar";
    }
  });

  atualizarTela();
});
