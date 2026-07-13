const API_BASE_URL = "https://buildcontrol-api.vercel.app";

const sessaoSalva = lerJSONLocal("buildcontrol_session", null);
if (!sessaoSalva?.access_token) window.location.replace("login.html");

let materiais = [];
let guardados = [];
let editandoMaterial = null;
let editandoGuardado = null;
let filtroMaterial = "Todos";
let buscaMaterial = "";
let eventoInstalacao = null;
let salvando = false;
let timerSalvamento = null;

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const moedaCurta = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const $ = id => document.getElementById(id);

function lerJSONLocal(chave, padrao) {
  try {
    const valor = localStorage.getItem(chave);
    return valor ? JSON.parse(valor) : padrao;
  } catch {
    return padrao;
  }
}

function escapar(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function lerRespostaJSON(resposta) {
  const texto = await resposta.text();
  if (!texto) return {};
  try { return JSON.parse(texto); } catch { return { erro: texto }; }
}

function toast(texto) {
  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = texto;
  $("toastContainer")?.appendChild(item);
  setTimeout(() => item.remove(), 2600);
}

function atualizarStatusSync(texto, tipo = "online") {
  const el = $("syncStatus");
  if (!el) return;
  el.innerHTML = `<i></i> ${escapar(texto)}`;
  el.dataset.tipo = tipo;
}

function lerBackupLocal() {
  return {
    materiais: lerJSONLocal("buildcontrol_materiais", []),
    guardados: lerJSONLocal("buildcontrol_guardados", [])
  };
}

function salvarLocal() {
  localStorage.setItem("buildcontrol_materiais", JSON.stringify(materiais));
  localStorage.setItem("buildcontrol_guardados", JSON.stringify(guardados));
}

function limparSessao() {
  localStorage.removeItem("buildcontrol_session");
  localStorage.removeItem("buildcontrol_user");
}

async function carregarDadosOnline() {
  try {
    atualizarStatusSync("Carregando online...");
    const resposta = await fetch(`${API_BASE_URL}/api/dados`, {
      headers: { Authorization: `Bearer ${sessaoSalva.access_token}` }
    });
    const dados = await lerRespostaJSON(resposta);
    if (!resposta.ok) {
      if (resposta.status === 401) {
        limparSessao();
        window.location.replace("login.html");
        return;
      }
      throw new Error(dados.erro || "Erro ao carregar dados.");
    }
    materiais = Array.isArray(dados.materiais) ? dados.materiais : [];
    guardados = Array.isArray(dados.guardados) ? dados.guardados : [];
    salvarLocal();
    renderizarTudo(false);
    atualizarStatusSync("Online sincronizado");
  } catch (erro) {
    console.error(erro);
    const backup = lerBackupLocal();
    materiais = backup.materiais;
    guardados = backup.guardados;
    renderizarTudo(false);
    atualizarStatusSync("Usando backup local", "offline");
    toast("Sem conexão com a API. O backup local foi carregado.");
  }
}

async function salvarOnline(forcar = false) {
  salvarLocal();
  if (!sessaoSalva?.access_token) return;
  if (!forcar) {
    clearTimeout(timerSalvamento);
    timerSalvamento = setTimeout(() => salvarOnline(true), 450);
    return;
  }
  if (salvando) return;
  try {
    salvando = true;
    atualizarStatusSync("Salvando online...");
    const resposta = await fetch(`${API_BASE_URL}/api/dados`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessaoSalva.access_token}`
      },
      body: JSON.stringify({ materiais, guardados })
    });
    const dados = await lerRespostaJSON(resposta);
    if (!resposta.ok) {
      if (resposta.status === 401) {
        limparSessao();
        window.location.replace("login.html");
        return;
      }
      throw new Error(dados.erro || "Erro ao salvar dados.");
    }
    atualizarStatusSync("Salvo online");
  } catch (erro) {
    console.error(erro);
    atualizarStatusSync("Salvo somente no aparelho", "offline");
    toast("Os dados ficaram salvos no aparelho e serão enviados quando houver conexão.");
  } finally {
    salvando = false;
  }
}

function totais() {
  const totalMateriais = materiais.reduce((soma, item) => soma + Number(item.quantidade || 0) * Number(item.valor || 0), 0);
  const totalGuardado = guardados.reduce((soma, item) => soma + Number(item.valor || 0), 0);
  const faltaPagar = Math.max(totalMateriais - totalGuardado, 0);
  const percentual = totalMateriais > 0 ? Math.min(100, (totalGuardado / totalMateriais) * 100) : 0;
  return { totalMateriais, totalGuardado, faltaPagar, percentual };
}

function atualizarStatusAutomatico() {
  let saldo = totais().totalGuardado;
  materiais.forEach(item => {
    const total = Number(item.quantidade || 0) * Number(item.valor || 0);
    if (total > 0 && saldo >= total) {
      item.status = "Concluído";
      item.cobertura = 100;
      saldo -= total;
    } else if (total > 0 && saldo > 0) {
      item.status = "Parcial";
      item.cobertura = Math.min(100, (saldo / total) * 100);
      saldo = 0;
    } else {
      item.status = "Pendente";
      item.cobertura = 0;
    }
  });
}

function normalizar(texto) {
  return String(texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function infoMaterial(nome) {
  const texto = normalizar(nome);
  if (texto.includes("cimento") || texto.includes("argamassa") || texto.includes("cal")) return { emoji: "🪣", categoria: "Cimento e argamassa", cor: "#ffbf00" };
  if (texto.includes("tijolo") || texto.includes("bloco")) return { emoji: "🧱", categoria: "Tijolos e blocos", cor: "#ff8b38" };
  if (texto.includes("areia") || texto.includes("brita") || texto.includes("pedra")) return { emoji: "⛰", categoria: "Areia e brita", cor: "#3d9cff" };
  if (texto.includes("ferro") || texto.includes("aco") || texto.includes("vergalhao") || texto.includes("coluna")) return { emoji: "⚙", categoria: "Ferragens", cor: "#8b6cf6" };
  if (texto.includes("madeira") || texto.includes("tabua") || texto.includes("caibro") || texto.includes("ripa")) return { emoji: "🪵", categoria: "Madeiras", cor: "#b87b43" };
  if (texto.includes("telha")) return { emoji: "⌂", categoria: "Cobertura", cor: "#e45c68" };
  if (texto.includes("fio") || texto.includes("cabo") || texto.includes("disjuntor") || texto.includes("tomada")) return { emoji: "⚡", categoria: "Elétrica", cor: "#f4d34f" };
  if (texto.includes("cano") || texto.includes("tubo") || texto.includes("registro")) return { emoji: "◉", categoria: "Hidráulica", cor: "#27c8c8" };
  if (texto.includes("tinta") || texto.includes("massa corrida")) return { emoji: "◐", categoria: "Acabamento", cor: "#ef6fca" };
  return { emoji: "▦", categoria: "Outros", cor: "#7891af" };
}

function classeStatus(status) {
  return normalizar(status).replace(/\s+/g, "-");
}

function categoriasAgrupadas() {
  const mapa = new Map();
  materiais.forEach(item => {
    const info = infoMaterial(item.nome);
    const valor = Number(item.quantidade || 0) * Number(item.valor || 0);
    if (!mapa.has(info.categoria)) mapa.set(info.categoria, { nome: info.categoria, valor: 0, cor: info.cor });
    mapa.get(info.categoria).valor += valor;
  });
  return [...mapa.values()].sort((a, b) => b.valor - a.valor);
}

function atualizarResumo() {
  const { totalMateriais, totalGuardado, faltaPagar, percentual } = totais();
  const set = (id, valor) => { if ($(id)) $(id).textContent = valor; };
  set("totalMateriais", moeda.format(totalMateriais));
  set("totalGuardado", moeda.format(totalGuardado));
  set("faltaPagar", moeda.format(faltaPagar));
  set("qtdMateriaisResumo", `${materiais.length} ${materiais.length === 1 ? "item cadastrado" : "itens cadastrados"}`);
  set("qtdMesesResumo", `${guardados.length} ${guardados.length === 1 ? "mês registrado" : "meses registrados"}`);
  set("porcentagemFalta", `${totalMateriais ? Math.round((faltaPagar / totalMateriais) * 100) : 0}% do total`);
  set("progressoPercentual", `${Math.round(percentual)}%`);
  set("relatorioPercentual", `${Math.round(percentual)}%`);
  set("progressoLegenda", totalMateriais ? `${moeda.format(totalGuardado)} de ${moeda.format(totalMateriais)}` : "Comece adicionando materiais");
  set("totalGuardadoPagina", moeda.format(totalGuardado));
  set("mediaGuardada", `Média mensal: ${moeda.format(guardados.length ? totalGuardado / guardados.length : 0)}`);
  set("relatorioPlanejado", moeda.format(totalMateriais));
  set("relatorioGuardado", moeda.format(totalGuardado));
  set("relatorioRestante", moeda.format(faltaPagar));
  if ($("progressoBarra")) $("progressoBarra").style.width = `${percentual}%`;
  if ($("relatorioBarra")) $("relatorioBarra").style.width = `${percentual}%`;
}

function materialCard(item, index) {
  const info = infoMaterial(item.nome);
  const total = Number(item.quantidade || 0) * Number(item.valor || 0);
  return `
    <article class="material-card">
      <span class="material-badge" style="background:${info.cor}18;color:${info.cor}">${info.emoji}</span>
      <div class="material-main">
        <h3>${escapar(item.nome)}</h3>
        <p>${escapar(item.quantidade)} un. × ${moeda.format(Number(item.valor || 0))} • ${escapar(info.categoria)}</p>
        <div class="material-price"><strong>${escapar(item.status || "Pendente")}</strong><div class="coverage-mini"><span style="width:${Number(item.cobertura || 0)}%;background:${info.cor}"></span></div></div>
      </div>
      <div class="material-actions">
        <strong>${moeda.format(total)}</strong>
        <div class="card-menu"><button class="small-icon-button" type="button" data-edit-material="${index}" title="Editar">✎</button><button class="small-icon-button delete" type="button" data-delete-material="${index}" title="Excluir">⌫</button></div>
      </div>
    </article>`;
}

function renderizarMateriais() {
  const lista = $("listaMateriais");
  if (!lista) return;
  const filtrados = materiais.map((item, index) => ({ item, index })).filter(({ item }) => {
    const passaBusca = normalizar(item.nome).includes(normalizar(buscaMaterial));
    const passaFiltro = filtroMaterial === "Todos" || item.status === filtroMaterial;
    return passaBusca && passaFiltro;
  });
  lista.innerHTML = filtrados.length ? filtrados.map(({ item, index }) => materialCard(item, index)).join("") : `<div class="empty-state" style="grid-column:1/-1">Nenhum material encontrado.</div>`;
}

function renderizarMateriaisRecentes() {
  const lista = $("materiaisRecentes");
  if (!lista) return;
  const recentes = materiais.slice(-5).reverse();
  lista.innerHTML = recentes.length ? recentes.map(item => {
    const info = infoMaterial(item.nome);
    const total = Number(item.quantidade || 0) * Number(item.valor || 0);
    return `<div class="recent-row"><span class="material-badge" style="background:${info.cor}18;color:${info.cor}">${info.emoji}</span><div><strong>${escapar(item.nome)}</strong><small>${escapar(item.quantidade)} un. • ${escapar(info.categoria)}</small></div><div class="recent-value"><strong>${moeda.format(total)}</strong><span class="status-dot ${classeStatus(item.status)}">${escapar(item.status)}</span></div></div>`;
  }).join("") : `<div class="empty-state">Nenhum material adicionado.</div>`;
}

function renderizarGuardados() {
  const lista = $("listaGuardado");
  if (!lista) return;
  lista.innerHTML = guardados.length ? guardados.map((item, index) => `
    <article class="saving-card">
      <span>${escapar(item.mes)}</span>
      <strong>${moeda.format(Number(item.valor || 0))}</strong>
      <div class="card-menu"><button class="small-icon-button" type="button" data-edit-saving="${index}" title="Editar">✎</button><button class="small-icon-button delete" type="button" data-delete-saving="${index}" title="Excluir">⌫</button></div>
    </article>`).join("") : `<div class="empty-state" style="grid-column:1/-1">Nenhum valor guardado registrado.</div>`;
}

function corGradienteCategorias(dados) {
  const total = dados.reduce((s, i) => s + i.valor, 0);
  if (!total) return "conic-gradient(#263447 0 100%)";
  let acumulado = 0;
  const partes = dados.map(item => {
    const inicio = acumulado;
    acumulado += (item.valor / total) * 100;
    return `${item.cor} ${inicio}% ${acumulado}%`;
  });
  return `conic-gradient(${partes.join(",")})`;
}

function renderizarCategorias() {
  const dados = categoriasAgrupadas();
  const total = totais().totalMateriais;
  const gradiente = corGradienteCategorias(dados);
  ["donutHome", "donutReport"].forEach(id => { if ($(id)) $(id).style.background = gradiente; });
  if ($("donutHomeTotal")) $("donutHomeTotal").textContent = `R$ ${moedaCurta.format(total)}`;
  if ($("donutReportTotal")) $("donutReportTotal").textContent = `R$ ${moedaCurta.format(total)}`;
  const html = dados.length ? dados.slice(0, 7).map(item => `<div class="legend-row"><i class="legend-color" style="background:${item.cor}"></i><span>${escapar(item.nome)}</span><strong>${total ? Math.round(item.valor / total * 100) : 0}%</strong></div>`).join("") : `<div class="empty-state">Sem dados.</div>`;
  if ($("categoriasHome")) $("categoriasHome").innerHTML = html;
  if ($("categoriasRelatorio")) $("categoriasRelatorio").innerHTML = html;
}

function renderizarGrafico() {
  const area = $("graficoGuardado");
  if (!area) return;
  const valores = guardados.map(item => Number(item.valor || 0));
  if (!valores.length) {
    area.innerHTML = `<div class="empty-state">Adicione valores guardados para gerar o gráfico.</div>`;
    return;
  }
  const largura = 900, altura = 230, paddingX = 34, paddingY = 24;
  const max = Math.max(...valores, 1);
  const passo = valores.length > 1 ? (largura - paddingX * 2) / (valores.length - 1) : 0;
  const pontos = valores.map((valor, i) => {
    const x = valores.length > 1 ? paddingX + passo * i : largura / 2;
    const y = altura - paddingY - (valor / max) * (altura - paddingY * 2);
    return { x, y, valor };
  });
  const linha = pontos.map(p => `${p.x},${p.y}`).join(" ");
  const areaPontos = `${paddingX},${altura - paddingY} ${linha} ${pontos.at(-1).x},${altura - paddingY}`;
  const grades = [0, .25, .5, .75, 1].map(fracao => {
    const y = altura - paddingY - fracao * (altura - paddingY * 2);
    return `<line class="chart-grid-line" x1="${paddingX}" x2="${largura - paddingX}" y1="${y}" y2="${y}"></line>`;
  }).join("");
  const dots = pontos.map(p => `<circle class="chart-dot" cx="${p.x}" cy="${p.y}" r="5"><title>${moeda.format(p.valor)}</title></circle>`).join("");
  area.innerHTML = `<svg viewBox="0 0 ${largura} ${altura}" preserveAspectRatio="none"><defs><linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#ffbf00" stop-opacity=".28"/><stop offset="100%" stop-color="#ffbf00" stop-opacity="0"/></linearGradient></defs>${grades}<polygon class="chart-area-fill" points="${areaPontos}"></polygon><polyline class="chart-line" points="${linha}"></polyline>${dots}</svg><div class="chart-labels">${guardados.map(item => `<span>${escapar(String(item.mes).slice(0,3))}</span>`).join("")}</div>`;
}

function renderizarPerfil() {
  const usuario = lerJSONLocal("buildcontrol_user", {}) || {};
  const nome = usuario.nome || usuario.name || usuario.user_metadata?.nome || usuario.email?.split("@")[0] || "Usuário";
  const email = usuario.email || "Usuário do BuildControl";
  const primeiro = String(nome).trim().split(/\s+/)[0] || "Usuário";
  if ($("nomeUsuarioHome")) $("nomeUsuarioHome").textContent = primeiro;
  if ($("nomeUsuarioPerfil")) $("nomeUsuarioPerfil").textContent = nome;
  if ($("emailUsuarioPerfil")) $("emailUsuarioPerfil").textContent = email;
  if ($("avatarUsuario")) $("avatarUsuario").textContent = primeiro.charAt(0).toUpperCase();
}

function renderizarTudo(sincronizar = true) {
  atualizarStatusAutomatico();
  salvarLocal();
  atualizarResumo();
  renderizarMateriais();
  renderizarMateriaisRecentes();
  renderizarGuardados();
  renderizarCategorias();
  renderizarGrafico();
  renderizarPerfil();
  if (sincronizar) salvarOnline();
}

function mudarView(view) {
  document.querySelectorAll(".app-view").forEach(secao => secao.classList.toggle("active", secao.dataset.view === view));
  document.querySelectorAll(".nav-item[data-go-view]").forEach(botao => botao.classList.toggle("active", botao.dataset.goView === view));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function abrirModal(tipo, index = null) {
  const overlay = $("modalOverlay");
  const formMaterial = $("formMaterial");
  const formGuardado = $("formGuardado");
  formMaterial.classList.toggle("hidden", tipo !== "material");
  formGuardado.classList.toggle("hidden", tipo !== "guardado");
  if (tipo === "material") {
    editandoMaterial = Number.isInteger(index) ? index : null;
    const item = editandoMaterial !== null ? materiais[editandoMaterial] : null;
    $("tituloMaterial").textContent = item ? "Editar material" : "Adicionar material";
    $("nomeMaterial").value = item?.nome || "";
    $("quantidadeMaterial").value = item?.quantidade ?? "";
    $("valorMaterial").value = item?.valor ?? "";
    setTimeout(() => $("nomeMaterial").focus(), 100);
  } else {
    editandoGuardado = Number.isInteger(index) ? index : null;
    const item = editandoGuardado !== null ? guardados[editandoGuardado] : null;
    $("tituloGuardado").textContent = item ? "Editar valor guardado" : "Adicionar valor guardado";
    $("mesGuardado").value = item?.mes || "";
    $("valorGuardadoInput").value = item?.valor ?? "";
    setTimeout(() => $("mesGuardado").focus(), 100);
  }
  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function fecharModal() {
  $("modalOverlay")?.classList.add("hidden");
  $("modalOverlay")?.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function salvarMaterial(event) {
  event.preventDefault();
  const nome = $("nomeMaterial").value.trim();
  const quantidade = Number($("quantidadeMaterial").value);
  const valor = Number($("valorMaterial").value);
  if (!nome || quantidade <= 0 || valor <= 0) return toast("Preencha os dados do material corretamente.");
  const novo = { nome, quantidade, valor, status: "Pendente" };
  if (editandoMaterial !== null) materiais[editandoMaterial] = novo;
  else materiais.push(novo);
  fecharModal();
  renderizarTudo(true);
  toast(editandoMaterial !== null ? "Material atualizado." : "Material adicionado.");
  editandoMaterial = null;
}

function salvarGuardado(event) {
  event.preventDefault();
  const mes = $("mesGuardado").value;
  const valor = Number($("valorGuardadoInput").value);
  if (!mes || valor <= 0) return toast("Selecione o mês e informe um valor válido.");
  const novo = { mes, valor };
  if (editandoGuardado !== null) guardados[editandoGuardado] = novo;
  else guardados.push(novo);
  fecharModal();
  renderizarTudo(true);
  toast(editandoGuardado !== null ? "Valor atualizado." : "Valor guardado adicionado.");
  editandoGuardado = null;
}

function excluirMaterial(index) {
  if (!confirm("Deseja excluir este material?")) return;
  materiais.splice(index, 1);
  renderizarTudo(true);
  toast("Material excluído.");
}

function excluirGuardado(index) {
  if (!confirm("Deseja excluir este valor guardado?")) return;
  guardados.splice(index, 1);
  renderizarTudo(true);
  toast("Valor excluído.");
}

function resetarTudo() {
  if (!confirm("Tem certeza que deseja apagar todos os materiais e valores guardados?")) return;
  materiais = [];
  guardados = [];
  renderizarTudo(true);
  toast("Todos os dados foram removidos.");
}

function sair() {
  limparSessao();
  window.location.replace("login.html");
}

function exportarBackup() {
  const dados = { exportado_em: new Date().toISOString(), materiais, guardados };
  const blob = new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `buildcontrol-backup-${new Date().toISOString().slice(0,10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  toast("Backup exportado.");
}

function configurarPWA() {
  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(console.error));
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    eventoInstalacao = event;
    $("btnInstalar")?.classList.remove("hidden");
  });
  window.addEventListener("appinstalled", () => {
    eventoInstalacao = null;
    $("btnInstalar")?.classList.add("hidden");
    toast("BuildControl instalado com sucesso.");
  });
}

async function instalarApp() {
  if (!eventoInstalacao) {
    toast("No navegador, abra o menu e escolha ‘Instalar app’ ou ‘Adicionar à tela inicial’.");
    return;
  }
  eventoInstalacao.prompt();
  await eventoInstalacao.userChoice;
  eventoInstalacao = null;
  $("btnInstalar")?.classList.add("hidden");
}

function configurarEventos() {
  document.addEventListener("click", event => {
    const go = event.target.closest("[data-go-view]");
    const open = event.target.closest("[data-open-modal]");
    const editMat = event.target.closest("[data-edit-material]");
    const delMat = event.target.closest("[data-delete-material]");
    const editSav = event.target.closest("[data-edit-saving]");
    const delSav = event.target.closest("[data-delete-saving]");
    if (go) mudarView(go.dataset.goView);
    if (open) abrirModal(open.dataset.openModal);
    if (editMat) abrirModal("material", Number(editMat.dataset.editMaterial));
    if (delMat) excluirMaterial(Number(delMat.dataset.deleteMaterial));
    if (editSav) abrirModal("guardado", Number(editSav.dataset.editSaving));
    if (delSav) excluirGuardado(Number(delSav.dataset.deleteSaving));
  });
  $("fecharModal")?.addEventListener("click", fecharModal);
  $("modalOverlay")?.addEventListener("click", event => { if (event.target.id === "modalOverlay") fecharModal(); });
  $("formMaterial")?.addEventListener("submit", salvarMaterial);
  $("formGuardado")?.addEventListener("submit", salvarGuardado);
  $("buscaMaterial")?.addEventListener("input", event => { buscaMaterial = event.target.value; renderizarMateriais(); });
  $("filtrosMateriais")?.addEventListener("click", event => {
    const botao = event.target.closest("[data-filter]");
    if (!botao) return;
    filtroMaterial = botao.dataset.filter;
    document.querySelectorAll("#filtrosMateriais button").forEach(item => item.classList.toggle("active", item === botao));
    renderizarMateriais();
  });
  $("btnResetar")?.addEventListener("click", resetarTudo);
  $("btnSair")?.addEventListener("click", sair);
  $("btnSairTopo")?.addEventListener("click", sair);
  $("btnExportar")?.addEventListener("click", exportarBackup);
  $("btnInstalar")?.addEventListener("click", instalarApp);
  $("btnInstalarPerfil")?.addEventListener("click", instalarApp);
  document.addEventListener("keydown", event => { if (event.key === "Escape") fecharModal(); });
}

async function iniciar() {
  configurarEventos();
  configurarPWA();
  const backup = lerBackupLocal();
  materiais = Array.isArray(backup.materiais) ? backup.materiais : [];
  guardados = Array.isArray(backup.guardados) ? backup.guardados : [];
  renderizarTudo(false);
  await carregarDadosOnline();
}

iniciar();
