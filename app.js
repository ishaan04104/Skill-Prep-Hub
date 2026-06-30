const BASE_QUESTIONS = (window.QUESTION_DATA && window.QUESTION_DATA.questions) || [];
const CONCEPTS = (window.CONCEPT_DATA && window.CONCEPT_DATA.concepts) || [];
const CUSTOM_KEY = 'aiSkillIqCustomQuestionsV1';
const AUTO_REF_CACHE_KEY = 'aiSkillIqAutoReferencePdfCacheV1';
const AUTO_REF_PATH = 'reference_pdfs';
const AUTO_REF_STATUS_ID = 'autoReferenceStatus';
const PROGRESS_KEY = 'aiSkillIqProgressV2';
const DIFFS = ['Medium','Hard','Very Hard'];
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const esc = (s='') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const norm = s => String(s||'').toLowerCase();
const uniq = arr => [...new Set(arr.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b)));
const pct = (c,t) => t ? Math.round((c/t)*100) : 0;
function shuffle(arr){ const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }
function sample(arr,n){ return shuffle(arr).slice(0, Math.min(n, arr.length)); }
function cleanQuestion(q){
  if(!q || !q.question || !Array.isArray(q.choices) || q.choices.length < 4) return null;
  let answerIndex = Number.isInteger(q.answerIndex) ? q.answerIndex : 'ABCD'.indexOf(String(q.answerLetter||'').toUpperCase()[0]);
  if(answerIndex < 0 || answerIndex > 3) return null;
  const difficulty = DIFFS.includes(q.difficulty) ? q.difficulty : 'Hard';
  return {
    id: String(q.id || `q_${Math.random().toString(36).slice(2)}`),
    bank: String(q.bank || 'Custom Questions').trim(),
    topic: String(q.topic || 'General').trim(),
    difficulty,
    question: String(q.question).trim(),
    choices: q.choices.slice(0,4).map(x=>String(x).trim()),
    answerIndex,
    answerLetter: 'ABCD'[answerIndex],
    explanation: String(q.explanation || q.rationale || 'No explanation provided.').trim(),
    source: String(q.source || 'Question bank').trim()
  };
}
function loadCustom(){ try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]').map(cleanQuestion).filter(Boolean); } catch(e){ return []; } }
function saveCustom(arr){ localStorage.setItem(CUSTOM_KEY, JSON.stringify(arr || [])); }
let CUSTOM = loadCustom();
let AUTO_REFERENCE = [];
let QUESTIONS = mergeQuestions(BASE_QUESTIONS, CUSTOM, AUTO_REFERENCE);
let parsedImport = [];
function mergeQuestions(...groups){
  const seen = new Set();
  return groups.flat().map(cleanQuestion).filter(Boolean).filter(q => {
    const key = `${norm(q.question)}__${q.choices.map(c=>norm(c)).join('|')}`;
    if(seen.has(key)) return false;
    seen.add(key); return true;
  });
}
let state = { view:'dashboard', mode:'learn', banks:new Set(), topics:new Set(), diffs:new Set(DIFFS), session:[], idx:0, selected:null, answers:[], timer:null, endAt:null };
function init(){
  bindEvents();
  renderAll();
  setMode('learn');
  showView('dashboard');
  autoLoadReferencePdfs().catch(err => {
    console.warn('Reference PDF auto-load failed', err);
    setAutoReferenceStatus(`Auto PDF load skipped: ${esc(err.message || err)}`);
  });
}
function bindEvents(){
  $('#homeLink').addEventListener('click', e => { e.preventDefault(); showView('dashboard'); });
  $$('.tab').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
  $$('[data-go]').forEach(b => b.addEventListener('click', () => showView(b.dataset.go)));
  $('#themeToggle').addEventListener('click', () => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'light' ? '' : 'light'; });
  $('#quickSprint').addEventListener('click', () => { state.banks.clear(); state.topics.clear(); setMode('skill'); startSession(); });
  $('#modeGrid').addEventListener('click', e => { const card=e.target.closest('.mode-card'); if(card) setMode(card.dataset.mode); });
  $('#bankSearch').addEventListener('input', renderBankChips);
  $('#topicSearch').addEventListener('input', renderTopicChips);
  $('#selectedOnly').addEventListener('change', renderTopicChips);
  $('#banksAll').addEventListener('click', () => { state.banks = new Set(uniq(QUESTIONS.map(q=>q.bank))); pruneTopics(); renderFilters(); updatePoolPreview(); });
  $('#banksNone').addEventListener('click', () => { state.banks.clear(); state.topics.clear(); renderFilters(); updatePoolPreview(); });
  $('#topicsAll').addEventListener('click', () => { state.topics = new Set(getAvailableTopics()); renderTopicChips(); updatePoolPreview(); });
  $('#topicsNone').addEventListener('click', () => { state.topics.clear(); renderTopicChips(); updatePoolPreview(); });
  $('#bankList').addEventListener('click', e => { const chip=e.target.closest('.chip'); if(!chip) return; toggle(state.banks, chip.dataset.value); pruneTopics(); renderFilters(); updatePoolPreview(); });
  $('#topicList').addEventListener('click', e => { const chip=e.target.closest('.chip'); if(!chip) return; toggle(state.topics, chip.dataset.value); renderTopicChips(); updatePoolPreview(); });
  $('#difficultyList').addEventListener('click', e => { const b=e.target.closest('button'); if(!b) return; toggle(state.diffs, b.dataset.value); renderDifficulty(); updatePoolPreview(); });
  ['questionCount','examMinutes','shuffleOptions'].forEach(id => $('#'+id).addEventListener('change', updatePoolPreview));
  $('#startBtn').addEventListener('click', startSession);
  $('#openConceptsBtn').addEventListener('click', () => renderConcepts(true));
  $('#conceptCategory').addEventListener('change', () => renderConcepts(false));
  $('#submitAnswer').addEventListener('click', submitAnswer);
  $('#nextQuestion').addEventListener('click', nextQuestion);
  $('#finishSession').addEventListener('click', finishSession);
  $('#importFile').addEventListener('change', () => { const f=$('#importFile').files[0]; $('#importFileName').textContent = f ? f.name : 'No file selected.'; parsedImport=[]; renderParsedPreview(); });
  $('#parseImportBtn').addEventListener('click', parseImportFile);
  $('#saveImportedBtn').addEventListener('click', saveParsedQuestions);
  $('#exportCustomBtn').addEventListener('click', () => downloadBlob(JSON.stringify({questions:CUSTOM}, null, 2), 'custom_questions_export.json', 'application/json'));
  $('#exportCustomTxtBtn').addEventListener('click', () => downloadBlob(serializeTxt(CUSTOM), 'custom_questions_export.txt', 'text/plain'));
  $('#downloadTemplateBtn').addEventListener('click', downloadTemplate);
  $('#clearCustomBtn').addEventListener('click', clearImported);
}
function toggle(set, val){ set.has(val) ? set.delete(val) : set.add(val); }
function renderAll(){ renderFilters(); renderDashboard(); renderLibrary(); renderImportStats(); updatePoolPreview(); }
function showView(view){
  state.view = view;
  $$('.view').forEach(v => v.classList.toggle('active', v.id === view+'View'));
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  if(view === 'setup') updatePoolPreview();
  if(view === 'concepts') renderConcepts(false);
  if(view === 'library') renderLibrary();
  const active = $(`.tab[data-view="${view}"]`); if(active) active.scrollIntoView({block:'nearest', inline:'center'});
  window.scrollTo({top:0, left:0, behavior:'auto'});
}
function setMode(mode){
  state.mode = mode;
  $$('.mode-card').forEach(c => c.classList.toggle('selected', c.dataset.mode === mode));
  $('#questionControls').classList.toggle('hidden', mode === 'concept');
  $('#conceptControls').classList.toggle('hidden', mode !== 'concept');
  if(mode === 'skill'){ $('#questionCount').value = 20; $('#examMinutes').value = 12; state.diffs = new Set(DIFFS); renderDifficulty(); }
  if(mode === 'concept') showView('concepts');
  updatePoolPreview();
}
function getAvailableTopics(){ const base = state.banks.size ? QUESTIONS.filter(q => state.banks.has(q.bank)) : QUESTIONS; return uniq(base.map(q=>q.topic)); }
function pruneTopics(){ const available = new Set(getAvailableTopics()); state.topics = new Set([...state.topics].filter(t => available.has(t))); }
function renderFilters(){ renderBankChips(); renderTopicChips(); renderDifficulty(); renderConceptCategory(); }
function renderBankChips(){
  const search = norm($('#bankSearch').value); const banks = uniq(QUESTIONS.map(q=>q.bank)).filter(b=>norm(b).includes(search));
  $('#bankList').innerHTML = banks.length ? banks.map(b => `<button type="button" class="chip ${state.banks.has(b)?'selected':''}" data-value="${esc(b)}">${esc(b)}</button>`).join('') : `<div class="empty">No banks match.</div>`;
  $('#bankCount').textContent = state.banks.size ? `${state.banks.size}/${uniq(QUESTIONS.map(q=>q.bank)).length}` : 'Choose';
}
function renderTopicChips(){
  const search = norm($('#topicSearch').value); const available = getAvailableTopics(); let topics = available.filter(t=>norm(t).includes(search));
  if($('#selectedOnly').checked) topics = topics.filter(t=>state.topics.has(t));
  $('#topicList').innerHTML = topics.length ? topics.map(t => `<button type="button" class="chip ${state.topics.has(t)?'selected':''}" data-value="${esc(t)}">${esc(t)}</button>`).join('') : `<div class="empty">No topics match.</div>`;
  $('#topicCount').textContent = state.topics.size ? `${state.topics.size}/${available.length}` : 'Optional';
}
function renderDifficulty(){ $('#difficultyList').innerHTML = DIFFS.map(d => `<button type="button" class="${state.diffs.has(d)?'selected':''}" data-value="${d}">${d}</button>`).join(''); }
function renderConceptCategory(){ $('#conceptCategory').innerHTML = ['All', ...uniq(CONCEPTS.map(c=>c.category))].map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join(''); }
function getPool(){
  const diffs = [...state.diffs];
  if(state.mode !== 'skill' && state.banks.size === 0) return [];
  let pool = QUESTIONS.filter(q => {
    const bankOK = state.banks.size ? state.banks.has(q.bank) : state.mode === 'skill';
    const topicOK = state.topics.size ? state.topics.has(q.topic) : true;
    return bankOK && topicOK && diffs.includes(q.difficulty);
  });
  if(state.mode === 'skill'){
    pool = QUESTIONS.filter(q => {
      const bankOK = state.banks.size ? state.banks.has(q.bank) : true;
      const topicOK = state.topics.size ? state.topics.has(q.topic) : true;
      return bankOK && topicOK && DIFFS.includes(q.difficulty);
    });
    if(pool.length < 20) pool = QUESTIONS.filter(q => DIFFS.includes(q.difficulty));
  }
  return pool;
}
function updatePoolPreview(){
  const pool = getPool(); const byDiff = Object.fromEntries(DIFFS.map(d=>[d, pool.filter(q=>q.difficulty===d).length]));
  $('#poolPreview').innerHTML = `<div class="card-title"><h2>Current pool</h2><span class="pill">${pool.length} MCQs</span></div>
    <div class="pool-grid">
      <div class="pool-card"><span>Questions</span><b>${pool.length}</b></div>
      <div class="pool-card"><span>Banks</span><b>${uniq(pool.map(q=>q.bank)).length}</b></div>
      <div class="pool-card"><span>Topics</span><b>${uniq(pool.map(q=>q.topic)).length}</b></div>
      <div class="pool-card"><span>Medium</span><b>${byDiff.Medium}</b></div>
      <div class="pool-card"><span>Hard</span><b>${byDiff.Hard}</b></div>
      <div class="pool-card"><span>Very Hard</span><b>${byDiff['Very Hard']}</b></div>
    </div><p class="muted">${state.mode !== 'skill' && state.banks.size===0 ? 'Select at least one question bank to start. For mixed practice, use Skill IQ Sprint.' : 'Ready to start. Learning shows feedback immediately; exam and sprint show review at the end.'}</p>`;
}
function renderDashboard(){
  const banks=uniq(QUESTIONS.map(q=>q.bank)), topics=uniq(QUESTIONS.map(q=>q.topic));
  $('#totalQuestionsHero').textContent = QUESTIONS.length;
  $('#statsGrid').innerHTML = [
    ['Total MCQs', QUESTIONS.length, 'Built-in + imported custom questions'],
    ['Question banks', banks.length, 'Topic-targeted practice sections'],
    ['Topics', topics.length, 'Architecture, RAG, prompt, eval, agents'],
    ['Concept cards', CONCEPTS.length, 'Study notes before practice']
  ].map(x=>`<article class="stat card"><span>${x[0]}</span><b>${x[1]}</b><small>${x[2]}</small></article>`).join('');
  const byBank={}; QUESTIONS.forEach(q => byBank[q.bank]=(byBank[q.bank]||0)+1); const max=Math.max(1,...Object.values(byBank));
  $('#coverageBadge').textContent = `${banks.length} banks`;
  $('#coverageList').innerHTML = Object.entries(byBank).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([k,v]) => `<div class="coverage-row"><span>${esc(k)}</span><div class="bar"><i style="width:${Math.round(v/max*100)}%"></i></div><span>${v}</span></div>`).join('');
}
function makeSessionQuestion(q){
  const options = q.choices.map((text,i)=>({text, correct:i===q.answerIndex, originalIndex:i}));
  const finalOptions = $('#shuffleOptions').checked ? shuffle(options) : options;
  return {...q, options: finalOptions, correctOptionIndex: finalOptions.findIndex(o=>o.correct), selectedIndex:null, isCorrect:null};
}
function startSession(){
  if(state.mode === 'concept'){ renderConcepts(true); return; }
  clearInterval(state.timer);
  const pool = getPool();
  if(!pool.length){ alert(state.banks.size===0 && state.mode!=='skill' ? 'Select at least one question bank first.' : 'No questions match the selected filters. Add more banks, topics, or difficulties.'); showView('setup'); return; }
  let requested = Math.max(1, parseInt($('#questionCount').value || '20', 10));
  let selected;
  if(state.mode === 'skill'){
    requested = 20; $('#questionCount').value = 20; $('#examMinutes').value = 12;
    const m=sample(pool.filter(q=>q.difficulty==='Medium'),6), h=sample(pool.filter(q=>q.difficulty==='Hard'),8), v=sample(pool.filter(q=>q.difficulty==='Very Hard'),6);
    selected = shuffle([...m,...h,...v]);
    if(selected.length < requested) selected = shuffle([...selected, ...sample(pool.filter(q=>!selected.some(s=>s.id===q.id)), requested-selected.length)]);
  } else selected = sample(pool, requested);
  state.session = selected.map(makeSessionQuestion).filter(q => q.options && q.options.length >= 4 && q.correctOptionIndex >= 0);
  if(!state.session.length){ alert('The selected pool contained malformed questions. Try another bank or re-import the bank as JSON.'); showView('setup'); return; }
  state.idx=0; state.selected=null; state.answers=[];
  const minutes=Math.max(1, parseInt($('#examMinutes').value || '12', 10));
  state.endAt = (state.mode==='exam' || state.mode==='skill') ? Date.now() + minutes*60000 : null;
  if(state.endAt) state.timer=setInterval(tick, 250);
  $('#sessionModeLabel').textContent = state.mode==='learn' ? 'Learning Mode' : state.mode==='exam' ? 'Exam Mode' : 'Skill IQ-style Sprint';
  $('#sessionTitle').textContent = state.mode==='skill' ? 'Mixed timed practice' : 'Question Session';
  showView('session');
  renderQuestion();
  tick();
}
function tick(){
  if(!state.endAt){ $('#timer').textContent='Practice'; return; }
  const sec=Math.max(0, Math.ceil((state.endAt-Date.now())/1000));
  const m=Math.floor(sec/60), s=sec%60; $('#timer').textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  if(sec<=0){ clearInterval(state.timer); finishSession(); }
}
function renderQuestion(){
  const q = state.session[state.idx]; state.selected = null;
  if(!q){ $('#progressText').textContent='0/0'; $('#questionText').textContent='No active question. Go back to Practice Setup and start again.'; $('#choices').innerHTML=''; $('#submitAnswer').classList.add('hidden'); return; }
  $('#progressText').textContent = `${state.idx+1}/${state.session.length}`;
  $('#progressFill').style.width = `${Math.round((state.idx/state.session.length)*100)}%`;
  $('#liveScore').textContent = `${pct(state.answers.filter(a=>a.correct).length, state.answers.length)}%`;
  $('#qBank').textContent=q.bank; $('#qTopic').textContent=q.topic; $('#qDifficulty').textContent=q.difficulty;
  $('#questionText').textContent = q.question;
  $('#choices').innerHTML = q.options.map((o,i)=>`<button type="button" class="choice" data-i="${i}"><span class="letter">${String.fromCharCode(65+i)}</span><span>${esc(o.text)}</span></button>`).join('');
  $$('#choices .choice').forEach(btn => btn.addEventListener('click', () => selectChoice(Number(btn.dataset.i))));
  $('#feedback').className = 'feedback hidden'; $('#feedback').innerHTML='';
  $('#submitAnswer').classList.remove('hidden'); $('#submitAnswer').disabled=false; $('#nextQuestion').classList.add('hidden');
}
function selectChoice(i){ state.selected=i; $$('#choices .choice').forEach((b,idx)=>b.classList.toggle('selected', idx===i)); }
function submitAnswer(){
  const q = state.session[state.idx]; if(!q){ alert('No active question loaded.'); return; }
  if(state.selected == null){ alert('Select an answer first.'); return; }
  if(q.selectedIndex !== null) return;
  const correct = state.selected === q.correctOptionIndex; q.selectedIndex=state.selected; q.isCorrect=correct;
  state.answers.push({id:q.id, correct, selected:state.selected, question:q}); markAnswered(q, correct);
  if(state.mode === 'learn'){
    $$('#choices .choice').forEach((b,idx)=>{ b.disabled=true; if(idx===q.correctOptionIndex)b.classList.add('correct'); if(idx===state.selected && !correct)b.classList.add('wrong'); });
    $('#feedback').className = `feedback ${correct?'good':'bad'}`;
    $('#feedback').innerHTML = `<h3>${correct?'Correct':'Wrong'}</h3><p><b>Correct answer:</b> ${String.fromCharCode(65+q.correctOptionIndex)}. ${esc(q.options[q.correctOptionIndex].text)}</p><p>${esc(q.explanation)}</p>`;
    $('#submitAnswer').classList.add('hidden'); $('#nextQuestion').classList.remove('hidden');
    $('#liveScore').textContent = `${pct(state.answers.filter(a=>a.correct).length, state.answers.length)}%`;
  } else nextQuestion();
}
function nextQuestion(){ if(state.idx < state.session.length-1){ state.idx++; renderQuestion(); } else finishSession(); }
function finishSession(){
  clearInterval(state.timer); if(!state.session.length){ showView('setup'); return; }
  const total=state.session.length, answered=state.answers.length, correct=state.answers.filter(a=>a.correct).length, score=pct(correct,total); saveBest(score);
  $('#resultsPanel').style.setProperty('--score', `${score}%`);
  $('#resultsPanel').innerHTML = `<div class="result-hero"><div class="big-percent">${score}%</div><div><p class="eyebrow">Session complete</p><h1>${correct}/${total} correct</h1><p class="muted">Answered ${answered}/${total}. Use Learning Mode to review weak areas.</p><div class="actions"><button class="primary" id="retryBtn" type="button">Retry random set</button><button class="secondary" id="backSetupBtn" type="button">Back to setup</button></div></div></div>
  <h2>Breakdown by difficulty</h2><div class="breakdown">${breakdownCards('difficulty')}</div>
  <h2>Breakdown by topic</h2><div class="breakdown">${breakdownCards('topic',12)}</div>
  <h2>Review</h2><div class="review-list">${reviewList()}</div>`;
  $('#retryBtn').addEventListener('click', startSession); $('#backSetupBtn').addEventListener('click', () => showView('setup'));
  showView('results');
}
function breakdownCards(field, limit=99){ const obj={}; state.session.forEach(q=>{ const k=q[field]; obj[k]=obj[k]||{c:0,t:0}; obj[k].t++; }); state.answers.forEach(a=>{ if(a.correct){ const k=a.question[field]; if(obj[k]) obj[k].c++; }}); return Object.entries(obj).sort((a,b)=>b[1].t-a[1].t).slice(0,limit).map(([k,v])=>`<div class="break-card"><b>${esc(k)}</b><p>${v.c}/${v.t} correct · ${pct(v.c,v.t)}%</p></div>`).join(''); }
function reviewList(){ return state.session.map((q,i)=>{ const a=state.answers.find(x=>x.id===q.id); const cls=!a?'skipped':a.correct?'correct':'wrong'; const sel=a?q.options[a.selected].text:'Not answered'; return `<div class="review-item ${cls}"><p><b>${i+1}. ${esc(q.question)}</b></p><p>${a ? (a.correct?'Correct':'Wrong') : 'Skipped'} · Your answer: ${esc(sel)}</p><p><b>Correct:</b> ${esc(q.options[q.correctOptionIndex].text)}</p><p>${esc(q.explanation)}</p></div>`; }).join(''); }
function loadProgress(){ try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{"answered":{},"best":null}'); } catch(e){ return {answered:{}, best:null}; } }
function saveProgress(p){ localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); }
function markAnswered(q, correct){ const p=loadProgress(); p.answered[q.id]={correct,t:Date.now(),topic:q.topic,bank:q.bank}; saveProgress(p); }
function saveBest(score){ const p=loadProgress(); p.best = p.best==null ? score : Math.max(p.best, score); saveProgress(p); }
function renderConcepts(activate=false){
  const cat = $('#conceptCategory').value || 'All'; const cards = CONCEPTS.filter(c => cat==='All' || c.category===cat);
  $('#conceptPanel').innerHTML = `<div class="concept-head card"><div><p class="eyebrow">Concept Mode</p><h1>${esc(cat)} Knowledge Cards</h1><p class="muted">Study cards before practice. Each card focuses on common Skill IQ traps.</p></div><button class="primary" id="conceptPracticeBtn" type="button">Practice questions</button></div><div class="concept-grid">${cards.map(c=>`<article class="concept-card"><span class="pill">${esc(c.category)}</span><h3>${esc(c.title)}</h3><p>${esc(c.body)}</p><ul>${(c.keyPoints||[]).map(k=>`<li>${esc(k)}</li>`).join('')}</ul><div class="pitfall"><b>Test trap:</b> ${esc(c.pitfall||'')}</div></article>`).join('')}</div>`;
  $('#conceptPracticeBtn').addEventListener('click', () => { setMode('learn'); showView('setup'); });
  if(activate) showView('concepts');
}
function renderLibrary(){ const byBank={}; QUESTIONS.forEach(q => { byBank[q.bank]=byBank[q.bank]||{t:0, topics:new Set(), diffs:new Set()}; byBank[q.bank].t++; byBank[q.bank].topics.add(q.topic); byBank[q.bank].diffs.add(q.difficulty); }); $('#libraryGrid').innerHTML = Object.entries(byBank).sort((a,b)=>a[0].localeCompare(b[0])).map(([bank,v])=>`<article class="library-card"><b>${esc(bank)}</b><span>${v.t} questions · ${v.topics.size} topics · ${[...v.diffs].join(', ')}</span></article>`).join(''); }
function renderImportStats(){
  $('#customCountBadge').textContent = `${CUSTOM.length} custom · ${AUTO_REFERENCE.length} auto`;
  const banks=uniq(CUSTOM.map(q=>q.bank)), topics=uniq(CUSTOM.map(q=>q.topic));
  $('#customSummary').innerHTML = CUSTOM.length ? `<b>Saved custom library</b><p>${CUSTOM.length} questions · ${banks.length} banks · ${topics.length} topics</p><p><b>Banks:</b> ${esc(banks.slice(0,5).join(', '))}${banks.length>5?'...':''}</p>` : 'No saved imported questions yet.';
  renderParsedPreview();
  updateAutoReferenceStatus();
}
function renderParsedPreview(){ $('#parsedBadge').textContent = `${parsedImport.length} parsed`; $('#saveImportedBtn').disabled = !parsedImport.length; $('#parsedPreview').className = parsedImport.length ? 'parsed-preview' : 'parsed-preview empty'; $('#parsedPreview').innerHTML = parsedImport.length ? parsedImport.slice(0,15).map((q,i)=>`<article class="parsed-item"><span class="pill">${esc(q.difficulty)}</span><h3>${i+1}. ${esc(q.question)}</h3><p><b>Bank:</b> ${esc(q.bank)} · <b>Topic:</b> ${esc(q.topic)}</p><p><b>Answer:</b> ${esc(q.answerLetter)}. ${esc(q.choices[q.answerIndex])}</p></article>`).join('') + (parsedImport.length>15?`<div class="empty">Showing first 15 of ${parsedImport.length}.</div>`:'') : 'No parsed questions yet.'; }
function getImportDefaults(){ return { bank: $('#defaultBank').value.trim() || 'Custom Imported Questions', topic: $('#defaultTopic').value.trim() || 'Imported Practice', difficulty: $('#defaultDifficulty').value || 'Hard' }; }

function setAutoReferenceStatus(html){
  const el = document.getElementById(AUTO_REF_STATUS_ID);
  if(el) el.innerHTML = html;
}
function updateAutoReferenceStatus(){
  if(!document.getElementById(AUTO_REF_STATUS_ID)) return;
  const banks = uniq(AUTO_REFERENCE.map(q=>q.bank));
  if(AUTO_REFERENCE.length){
    setAutoReferenceStatus(`<b>${AUTO_REFERENCE.length}</b> auto-loaded questions from reference PDFs. <br><small>Banks: ${esc(banks.slice(0,6).join(', '))}${banks.length>6?'...':''}</small>`);
  } else {
    setAutoReferenceStatus('No reference PDFs auto-loaded yet. On GitHub Pages, PDFs in <code>reference_pdfs/</code> are discovered automatically. For local/custom-domain use, update <code>reference_pdfs/manifest.json</code>.');
  }
}
async function autoLoadReferencePdfs(){
  if(!window.pdfjsLib){ updateAutoReferenceStatus(); return; }
  setAutoReferenceStatus('Checking reference PDFs for import-ready question banks...');
  const sources = await discoverReferencePdfs();
  if(!sources.length){ updateAutoReferenceStatus(); return; }
  const parsed = [];
  const report = [];
  for(const src of sources){
    try{
      const defaults = {
        bank: src.bank || cleanBankName(src.name || src.file || src.url),
        topic: src.topic || 'Reference PDF Import',
        difficulty: src.difficulty || 'Hard'
      };
      const text = await extractPdfTextFromUrl(src.url || src.file);
      const qs = parseQuestionText(text, defaults).map((q,i)=>cleanQuestion({...q, source:`Auto PDF: ${src.name || src.file || src.url}`, id:q.id || `auto_${slug(defaults.bank)}_${i}` })).filter(Boolean);
      parsed.push(...qs);
      report.push(`${esc(src.name || src.file || src.url)}: ${qs.length} questions`);
    } catch(e){
      console.warn('Auto PDF parse failed', src, e);
      report.push(`${esc(src.name || src.file || src.url)}: skipped (${esc(e.message || e)})`);
    }
  }
  AUTO_REFERENCE = parsed;
  QUESTIONS = mergeQuestions(BASE_QUESTIONS, CUSTOM, AUTO_REFERENCE);
  renderAll();
  setAutoReferenceStatus(report.length ? `<b>${AUTO_REFERENCE.length}</b> auto-loaded questions from reference PDFs.<br><small>${report.join('<br>')}</small>` : 'No reference PDFs found.');
}
async function discoverReferencePdfs(){
  const viaGithub = await discoverReferencePdfsViaGithub().catch(()=>[]);
  if(viaGithub.length) return viaGithub;
  return await discoverReferencePdfsViaManifest().catch(()=>[]);
}
async function discoverReferencePdfsViaManifest(){
  const res = await fetch(`${AUTO_REF_PATH}/manifest.json?ts=${Date.now()}`, {cache:'no-store'});
  if(!res.ok) return [];
  const manifest = await res.json();
  const files = Array.isArray(manifest) ? manifest : (manifest.files || []);
  return files.map(item => {
    const entry = typeof item === 'string' ? {file:item} : item;
    if(!entry.file && !entry.url) return null;
    const file = entry.url || `${AUTO_REF_PATH}/${entry.file}`;
    if(!/\.pdf($|\?)/i.test(file)) return null;
    return {...entry, name:entry.name || entry.file || entry.url, url:file};
  }).filter(Boolean);
}
async function discoverReferencePdfsViaGithub(){
  const host = location.hostname;
  if(!host.endsWith('.github.io')) return [];
  const owner = host.replace('.github.io','');
  let repo = location.pathname.split('/').filter(Boolean)[0];
  if(!repo) repo = `${owner}.github.io`;
  if(!owner || !repo) return [];
  const api = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${AUTO_REF_PATH}`;
  const res = await fetch(api, {cache:'no-store'});
  if(!res.ok) return [];
  const items = await res.json();
  if(!Array.isArray(items)) return [];
  return items.filter(x => x.type === 'file' && /\.pdf$/i.test(x.name) && x.download_url).map(x => ({name:x.name, file:x.name, url:x.download_url, sha:x.sha, bank:cleanBankName(x.name), topic:'Reference PDF Import', difficulty:'Hard'}));
}
async function extractPdfTextFromUrl(url){
  if(!window.pdfjsLib) throw new Error('PDF.js is unavailable.');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument(url).promise;
  let out='';
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p);
    const content=await page.getTextContent();
    const lines={};
    content.items.forEach(item=>{ const y=Math.round(item.transform[5]); lines[y]=lines[y]||[]; lines[y].push(item.str); });
    out += Object.keys(lines).sort((a,b)=>b-a).map(y=>lines[y].join(' ')).join('\n') + '\n';
  }
  return out;
}
function cleanBankName(name=''){
  return String(name).split('/').pop().replace(/\.pdf$/i,'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim() || 'Reference PDF Questions';
}
function slug(s=''){
  return norm(s).replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,50) || 'reference_pdf';
}
async function parseImportFile(){
  const file = $('#importFile').files[0]; if(!file){ alert('Choose a file first.'); return; }
  $('#importStatus').textContent = 'Reading file...'; parsedImport=[]; renderParsedPreview();
  try{
    let parsed=[]; const name=file.name.toLowerCase(); const defaults=getImportDefaults();
    if(name.endsWith('.json')){ const json=JSON.parse(await file.text()); const arr=Array.isArray(json)?json:(json.questions||[]); parsed=arr.map((q,i)=>normalizeImported(q,i,defaults)).filter(Boolean); }
    else if(name.endsWith('.pdf')){ const text=await extractPdfText(file); parsed=parseQuestionText(text,defaults); }
    else { parsed=parseQuestionText(await file.text(), defaults); }
    parsedImport = parsed; $('#importStatus').innerHTML = parsed.length ? `<b>${parsed.length}</b> questions parsed successfully. Review preview, then save.` : 'No valid questions found. Use the template format or JSON.';
  } catch(e){ console.error(e); $('#importStatus').textContent = `Import failed: ${e.message || e}`; }
  renderParsedPreview();
}
function normalizeImported(q,i,defaults){ const x=cleanQuestion({...q, bank:q.bank||defaults.bank, topic:q.topic||defaults.topic, difficulty:q.difficulty||defaults.difficulty, id:q.id||`custom_${Date.now()}_${i}`}); return x; }
async function extractPdfText(file){
  if(!window.pdfjsLib) throw new Error('PDF.js is unavailable. Import JSON/TXT or host the app with internet access.');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  const data = await file.arrayBuffer(); const pdf = await pdfjsLib.getDocument({data}).promise; let out='';
  for(let p=1;p<=pdf.numPages;p++){ const page=await pdf.getPage(p); const content=await page.getTextContent(); const lines={}; content.items.forEach(item=>{ const y=Math.round(item.transform[5]); lines[y]=lines[y]||[]; lines[y].push(item.str); }); out += Object.keys(lines).sort((a,b)=>b-a).map(y=>lines[y].join(' ')).join('\n') + '\n'; }
  return out;
}
function parseQuestionText(text, defaults){
  let src = String(text||'').replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n');
  src = src.replace(/Advanced .*?Question Bank[\s\S]*?(?=\n?\s*(?:Q(?:uestion)?\s*)?1[\).:\-]\s+)/i, '');
  const blocks=[]; const re=/(?:^|\n)\s*(?:Q(?:uestion)?\s*)?\d{1,3}[\).:\-]\s+/gi; let m; const starts=[]; while((m=re.exec(src))!==null) starts.push(m.index + (src[m.index]==='\n'?1:0));
  if(!starts.length) return [];
  for(let i=0;i<starts.length;i++) blocks.push(src.slice(starts[i], starts[i+1]||src.length).trim());
  return blocks.map((b,i)=>parseBlock(b,i,defaults)).filter(Boolean);
}
function parseBlock(block,i,defaults){
  const optRe=/\n\s*([A-D])[\).]\s+/g; const opts=[]; let m; while((m=optRe.exec('\n'+block))!==null) opts.push({letter:m[1], start:m.index});
  if(opts.length<4) return null;
  const stem = ('\n'+block).slice(0, opts[0].start).replace(/^\s*(?:Q(?:uestion)?\s*)?\d{1,3}[\).:\-]\s+/i,'').trim();
  const choices=[]; for(let j=0;j<4;j++){ const start=opts[j].start; const end=opts[j+1]?.start ?? ('\n'+block).search(/\n\s*(?:Answer|Correct|Explanation|Bank|Topic|Difficulty)\s*:/i); const segment=('\n'+block).slice(start, end>start?end:undefined).replace(/^\n\s*[A-D][\).]\s+/,'').trim(); choices.push(segment.replace(/\n+/g,' ')); }
  const answer = (block.match(/(?:Answer|Correct)\s*:\s*([A-D])/i)||[])[1]; if(!answer) return null;
  const explanation=(block.match(/(?:Explanation|Rationale)\s*:\s*([\s\S]*?)(?=\n\s*(?:Bank|Topic|Difficulty)\s*:|$)/i)||[])[1] || 'Imported question.';
  const bank=(block.match(/Bank\s*:\s*(.+)/i)||[])[1] || defaults.bank;
  const topic=(block.match(/Topic\s*:\s*(.+)/i)||[])[1] || defaults.topic;
  const diff=(block.match(/Difficulty\s*:\s*(Medium|Hard|Very Hard)/i)||[])[1] || defaults.difficulty;
  return normalizeImported({id:`custom_${Date.now()}_${i}`, bank:bank.trim(), topic:topic.trim(), difficulty:diff.trim(), question:stem, choices, answerLetter:answer, explanation:explanation.trim()}, i, defaults);
}
function saveParsedQuestions(){ if(!parsedImport.length){ alert('Parse a file first.'); return; } const replace=$('#replaceImported').checked; const current=replace?[]:CUSTOM; const existing=new Set(current.map(q=>`${q.question}__${q.choices.join('|')}`)); let added=0; const merged=[...current]; parsedImport.forEach(q=>{ const k=`${q.question}__${q.choices.join('|')}`; if(!existing.has(k)){ existing.add(k); merged.push(q); added++; } }); saveCustom(merged); CUSTOM=loadCustom(); QUESTIONS=mergeQuestions(BASE_QUESTIONS,CUSTOM,AUTO_REFERENCE); state.banks=new Set(uniq(parsedImport.map(q=>q.bank))); state.topics.clear(); renderAll(); $('#importStatus').innerHTML=`Saved <b>${added}</b> question(s). They are now available in Practice Setup.`; showView('setup'); }
function serializeTxt(arr){ return arr.map((q,i)=>`${i+1}. ${q.question}\nA. ${q.choices[0]}\nB. ${q.choices[1]}\nC. ${q.choices[2]}\nD. ${q.choices[3]}\nAnswer: ${q.answerLetter}\nExplanation: ${q.explanation}\nBank: ${q.bank}\nTopic: ${q.topic}\nDifficulty: ${q.difficulty}`).join('\n\n'); }
function downloadBlob(text, filename, type){ if(!text || text==='[]' || text==='{"questions": []}'){ alert('Nothing to export yet.'); return; } const blob=new Blob([text],{type}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); },1000); }
function downloadTemplate(){ downloadBlob('1. What is the safest RAG prompt design?\nA. Treat all retrieved text as instructions\nB. Separate instructions, user input, and retrieved context\nC. Ignore retrieved context\nD. Use no delimiters\nAnswer: B\nExplanation: Retrieved content should be treated as data, not higher-priority instructions.\nBank: Custom RAG Practice\nTopic: RAG prompting\nDifficulty: Very Hard', 'question_import_template.txt', 'text/plain'); }
function clearImported(){ if(confirm('Remove all imported custom questions from this browser?')){ saveCustom([]); CUSTOM=[]; QUESTIONS=mergeQuestions(BASE_QUESTIONS,CUSTOM,AUTO_REFERENCE); parsedImport=[]; renderAll(); $('#importStatus').textContent='Imported questions cleared.'; } }
document.addEventListener('DOMContentLoaded', init);
