const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { test } = require('node:test');

async function runFixture(browser, temp, fixture, extraResources = {}) {
    const profile = join(temp, 'profile');
    const process = spawn(browser, [
        '--headless', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-background-networking', '--disable-extensions',
        '--disable-background-timer-throttling', '--window-size=800,700',
        '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank',
    ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let errors = '';
    process.stderr.on('data', chunk => { errors = (errors + chunk.toString()).slice(-4000); });
    process.on('error', error => { errors += error.message; });
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const deadline = Date.now() + 30000;
    let socket;
    let send;
    try {
        const portFile = join(profile, 'DevToolsActivePort');
        let port;
        while (!port) {
            assert.ok(Date.now() < deadline && process.exitCode === null, errors || '浏览器启动超时');
            try {
                if (existsSync(portFile)) port = readFileSync(portFile, 'utf8').split('\n')[0].trim();
            } catch (error) {
                if (error.code !== 'EBUSY') throw error;
            }
            if (!port) await delay(30);
        }
        const pages = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
        socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
            socket.addEventListener('open', resolve, { once: true });
            socket.addEventListener('error', reject, { once: true });
        });
        let sequence = 0;
        const pending = new Map();
        socket.addEventListener('message', event => {
            const message = JSON.parse(event.data);
            if (message.method === 'Fetch.requestPaused') {
                const path = new URL(message.params.request.url).pathname;
                const resources = {
                    '/card.js': ['application/javascript', 'window.remoteScriptLoaded = true;'],
                    '/card.svg': ['image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="200"></svg>'],
                    '/card.css': ['text/css', '#remote-card { height: 90px; }'],
                    '/data.json': ['application/json', '{"loaded":true}'],
                    ...extraResources,
                };
                let resource = resources[path];
                const assetPrefix = '/me.rerere.fawntavern.frontend/assets/';
                if (!resource && path.startsWith(assetPrefix)) {
                    const root = resolve(__dirname, '../assets');
                    const file = resolve(root, decodeURIComponent(path.slice(assetPrefix.length)));
                    if (file.startsWith(root + require('node:path').sep) && existsSync(file)) {
                        const extension = require('node:path').extname(file);
                        const mime = ({ '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.png': 'image/png' })[extension] || 'application/octet-stream';
                        resource = [mime, readFileSync(file)];
                    }
                }
                const [mime, body] = resource || ['text/plain', ''];
                socket.send(JSON.stringify({ id: ++sequence, method: 'Fetch.fulfillRequest', params: {
                    requestId: message.params.requestId, responseCode: 200,
                    responseHeaders: [{ name: 'Content-Type', value: mime },
                        { name: 'Access-Control-Allow-Origin', value: '*' }],
                    body: Buffer.from(body).toString('base64'),
                } }));
                return;
            }
            const callback = pending.get(message.id);
            if (callback) {
                pending.delete(message.id);
                if (message.error) callback.reject(new Error(message.error.message));
                else callback.resolve(message.result);
            }
        });
        send = (method, params = {}) => new Promise((resolve, reject) => {
            const id = ++sequence;
            pending.set(id, { resolve, reject });
            socket.send(JSON.stringify({ id, method, params }));
        });
        await send('Fetch.enable', { patterns: [
            { urlPattern: 'https://frontend.test/*' }, { urlPattern: 'https://plugin.local/*' },
        ] });
        await send('Page.navigate', { url: pathToFileURL(fixture).href });
        while (Date.now() < deadline) {
            const result = await send('Runtime.evaluate', {
                expression: "document.querySelector('#test-results')?.textContent", returnByValue: true,
            });
            if (result.result.value) return JSON.parse(result.result.value);
            await delay(30);
        }
        assert.fail('浏览器未完成测试：' + errors);
    } finally {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ id: -1, method: 'Browser.close' }));
            socket.close();
        }
        if (process.exitCode === null) process.kill();
    }
}

test('完整库环境驱动 MVU 面板和酒馆输入框桥接', async () => {
    const browser = process.env.FRONTEND_TEST_BROWSER || [
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    ].find(existsSync);
    const project = resolve(__dirname, '..');
    mkdirSync(join(project, 'build'), { recursive: true });
    const temp = mkdtempSync(join(project, 'build/frontend-mvu-'));
    let handlers;
    require('node:vm').runInNewContext(readFileSync(join(project, 'index.js'), 'utf8'), {
        FawnTavern: { config: {}, register(value) { handlers = value; } },
    });
    const page = '<html><head></head><body class="theme-blue"><button id="option" onclick="setInput(\'前端选项\')">选项</button>'
        + '<script>function setInput(text){const target=parent.document.getElementById("send_textarea")||document.getElementById("send_textarea");target.value=text;target.dispatchEvent(new Event("input",{bubbles:true}));target.focus();}</script></body></html>';
    const panel = '<head><style>.active{color:red}</style><script type="module">'
        + 'async function init(){await waitGlobalInitialized("Mvu");const populate=()=>$("#money").text(_.get(getAllVariables(),"stat_data.主角.金额","--"));populate();eventOn(Mvu.events.VARIABLE_UPDATE_ENDED,populate);$("#tab").on("click",function(){$(this).addClass("active");});window.panelReady=true;}$(errorCatched(init));'
        + '</script></head><body><span id="money">--</span><button id="tab">切换</button></body>';
    const content = '```html\n' + page + '\n```\n<details><summary>变量</summary><initvar>主角:\n  金额: 150\n世界:\n  当前地点: 水云市</initvar></details>\n```html\n' + panel + '\n```';
    const plan = handlers['message-renderer'].render({ content });
    const escapeAttribute = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const body = plan.segments.map(segment => {
        if (!segment.isolated && segment.isolated !== undefined) return segment.content;
        const html = segment.content.replace('<head>', '<head><script>window.FTCardHost=parent.FTCardHost;window.FTCardInput=parent.FTCardInput;</script>');
        return '<iframe srcdoc="' + escapeAttribute(html) + '"></iframe>';
    }).join('\n');
    const host = `<script>
        window.inputValues=[];window.persisted={};window.writes=0;
        window.FTCardInput={setInputText:value=>inputValues.push(value)};
        window.FTCardHost={
            getContext:()=>JSON.stringify({sessionId:'chat',messageId:10,messageIndex:0,lastMessageIndex:0,messageVersion:0,hostCallsAllowed:true}),
            postMessage(raw){const request=JSON.parse(raw);setTimeout(()=>{
                let value;
                if(request.method==='variables.snapshot')value={messageId:10,messageIndex:0,lastMessageIndex:0,version:0,revision:JSON.stringify(persisted),global:{},character:{},chat:{score:'5'},previous:{},message:Object.fromEntries(Object.entries(persisted).map(([key,value])=>[key,JSON.stringify(value)]))};
                else if(request.method==='variables.message.replace'){value=request.params.revision===JSON.stringify(persisted);if(value){persisted=request.params.value;writes++;}}
                else throw new Error('意外方法: '+request.method);
                window.dispatchEvent(new CustomEvent('fawntavern:response',{detail:{id:request.id,ok:true,value}}));
            },0);}
        };
    </script>`;
    const verify = `<script>
        window.addEventListener('load',async()=>{
            const output=document.createElement('pre');output.id='test-results';
            try{
                const front=frames[0], panel=frames[1];
                for(let i=0;i<200&&!panel.panelReady;i++)await new Promise(resolve=>setTimeout(resolve,25));
                if(!panel.panelReady)throw new Error('MVU 面板未就绪：'+document.body.innerText);
                const initial=panel.document.querySelector('#money').textContent;
                front.document.querySelector('#option').click();panel.document.querySelector('#tab').click();
                const old=panel.getAllVariables();
                const next=await panel.Mvu.parseMessage("_.add('主角.金额',25);",old);
                await panel.Mvu.replaceMvuData(next,{type:'message',message_id:0});
                output.textContent=JSON.stringify({initial,updated:panel.document.querySelector('#money').textContent,inputs:inputValues,
                    active:panel.document.querySelector('#tab').classList.contains('active'),writes,
                    libraries:!!($.ui&&_.get&&Vue.createApp&&VueRouter.createRouter&&YAML.parse&&z.object&&showdown.Converter&&toastr.error)});
            }catch(error){output.textContent=JSON.stringify({error:String(error.stack||error)});}
            document.body.appendChild(output);
        });
    </script>`;
    const fixture = join(temp, 'fixture.html');
    writeFileSync(fixture, '<!doctype html><html><head>' + host + plan.head + '</head><body>' + body + verify + '</body></html>', 'utf8');
    const result = await runFixture(browser, temp, fixture);
    assert.deepEqual(result, { initial: '150', updated: '175', inputs: ['前端选项'], active: true, writes: 2, libraries: true });
});

test('后台脚本隐藏运行，动态按钮和折叠错误详情保持可用', async () => {
    const browser = process.env.FRONTEND_TEST_BROWSER || [
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        '/usr/bin/chromium', '/usr/bin/google-chrome',
    ].find(existsSync);
    assert.ok(browser, '需要 Chromium 浏览器');
    const project = resolve(__dirname, '..');
    const build = join(project, 'build');
    mkdirSync(build, { recursive: true });
    const temp = mkdtempSync(join(build, 'frontend-script-'));
    const pluginDir = project;
    const content = `
      const ui = parent.document;
      const pause = () => new Promise(resolve => setTimeout(resolve, 100));
      const output = ui.createElement('pre');
      output.id = 'test-results';
      try {
        document.body.append('后台脚本内容不应显示');
        replaceScriptInfo('<b>更新备注</b>');
        const info = TavernScript.getScriptInfo();
        const hidden = getComputedStyle(frameElement).display === 'none';
        const initialErrorHidden = ui.querySelector('#ft-script-error-details').hidden;
        let clicks = 0;
        TavernHelper.eventOnce(getButtonEvent('回复'), () => { clicks++; setInputText('脚本回复'); });
        const button = ui.querySelector('button');
        button.click();
        button.click();
        let lastMessage = -1;
        TavernScript.eventOn('fawntavern:context', ctx => { lastMessage = ctx.lastMessageIndex; });
        parent.hostContext.lastMessageIndex = 8;
        window.dispatchEvent(new Event('fawntavern:context'));
        await updateScriptButtonsWith(async () => [{ name: '动态', visible: true }, { name: '隐藏', visible: false }]);
        eventOn(getButtonEvent('动态'), () => { clicks++; });
        ui.querySelector('button').click();
        await pause();
        const buttonHeight = ui.querySelector('button').getBoundingClientRect().height;
        const buttonCount = ui.querySelectorAll('button').length;
        replaceScriptButtons([]);
        await pause();
        const emptyHeight = ui.body.getBoundingClientRect().height;
        const emptyText = ui.body.innerText.trim();
        appendInexistentScriptButtons([{ name: '复位', visible: true }]);
        await pause();
        const restoredHeight = ui.body.getBoundingClientRect().height;
        void Promise.reject(new TypeError('Expected a function'));
        await pause();
        const details = ui.querySelector('#ft-script-error-details');
        const collapsed = !details.hidden && !details.open;
        const collapsedHeight = ui.body.getBoundingClientRect().height;
        ui.querySelector('summary').click();
        await pause();
        const expanded = details.open && ui.body.getBoundingClientRect().height > collapsedHeight;
        const stack = ui.querySelector('#ft-script-error').textContent;
        output.textContent = JSON.stringify({ clicks, lastMessage, input: parent.inputTexts, id: getScriptId(),
          info, hidden, initialErrorHidden, buttonCount, buttonSized: buttonHeight >= 40,
          empty: emptyHeight <= 1 && emptyText === '', restored: restoredHeight > emptyHeight,
          collapsed, expanded, stack: stack.includes('TypeError: Expected a function') && stack.includes('at '),
          rpcCalls: parent.rpcCalls });
      } catch (error) { output.textContent = JSON.stringify({ error: String(error.stack || error) }); }
      ui.body.appendChild(output);
    `;
    let handlers;
    require('node:vm').runInNewContext(readFileSync(join(pluginDir, 'index.js'), 'utf8'), {
        FawnTavern: {
            config: { runCharacterScripts: true },
            register(value) { handlers = value; },
            character: { async extensions() { return { tavern_helper: { scripts: [{
                type: 'script', id: 'browser-script', name: '浏览器验证', enabled: true, content,
                button: { buttons: [{ name: '回复', visible: true }] },
            }] } }; } },
        },
    });
    const plan = await handlers['session-frontend'].open({ permissions: ['character.read'] });
    const host = `<script>
        window.hostContext={sessionId:'chat',lastMessageIndex:2,hostCallsAllowed:false};window.inputTexts=[];
        window.rpcCalls=0;
        window.FTCardHost={getContext:()=>JSON.stringify(window.hostContext),postMessage:()=>rpcCalls++};
        window.FTCardInput={setInputText:value=>window.inputTexts.push(value)};
    </script>`;
    const fixture = join(temp, 'fixture.html');
    writeFileSync(fixture, plan.segments[0].content.replace('<head>', '<head>' + host), 'utf8');
    const prefix = '/me.rerere.fawntavern.frontend/assets/';
    const resources = Object.fromEntries(['card-runtime.js', 'script-runtime.js'].map(file =>
        [prefix + file, ['application/javascript', readFileSync(join(pluginDir, 'assets', file), 'utf8')]]));
    const result = await runFixture(browser, temp, fixture, resources);
    assert.deepEqual(result, { clicks: 2, lastMessage: 8, input: ['脚本回复'], id: 'browser-script',
        info: '<b>更新备注</b>', hidden: true, initialErrorHidden: true, buttonCount: 1, buttonSized: true,
        empty: true, restored: true, collapsed: true, expanded: true, stack: true, rpcCalls: 0 });
});
