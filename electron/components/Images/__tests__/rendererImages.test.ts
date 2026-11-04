import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const template = require('lodash/template');

it.each(['production', 'development'])('HTML CSP has no wildcard sources in %s', mode => {
    const html = template(read('public/index.html'))({ webpackConfig: { mode } });
    const policy = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)![1];
    expect(policy).not.toContain('*');
    expect(policy).toContain("default-src 'self';");
    expect(policy).toContain("img-src 'self' data: blob:;");
    expect(policy).toContain("style-src 'self' 'unsafe-inline';");
    if (mode === 'production') {
        expect(policy).toContain("connect-src 'self';");
        expect(policy).not.toMatch(/(?:https?|wss?):/);
    } else {
        expect(policy).toContain("connect-src 'self' ws://localhost:3000;");
    }
});

it('all four active windows use the protected HTML and current Forge port is 3000', () => {
    const config = require(path.join(root, 'forge.config.js'));
    const forge = config.plugins.find((plugin: any[]) => plugin[0] === '@electron-forge/plugin-webpack')[1];
    expect(forge.renderer.entryPoints).toHaveLength(4);
    expect(forge.renderer.entryPoints.every((entry: any) => entry.html === './public/index.html')).toBe(true);
    expect(forge.port ?? 3000).toBe(3000);
});

it('the five formerly remote image sites use routed data or local placeholders', () => {
    const table = read('src/pages/Main/tabs/SteamAccountsTab/components/SteamAccountsTable.tsx');
    const edit = read('src/pages/Main/tabs/SteamAccountsTab/components/SteamAccountsEditForm/SteamAccountsEditForm.tsx');
    const proxy = read('src/pages/Main/tabs/ProxiesTab/components/AccountItem/AccountItem.tsx');
    const imported = read('src/pages/Main/tabs/SteamAccountsTab/components/SteamAccountsCreationForm/components/ImportAccountItem/ImportAccountItem.tsx');
    const sell = read('src/pages/Confirmations/SellItem/SellItem.tsx');
    for (const source of [table, edit, proxy, sell]) expect(source).toContain('useAccountImage(');
    for (const source of [table, edit, proxy, imported, sell]) {
        expect(source).not.toContain('sanitizeAvatarUrl');
        expect(source).not.toMatch(/src=\{(?:item\.confirmation\.icon|[^}]*avatarUrl)/);
    }
    expect(imported).toContain('src="./assets/img/User.svg"');
    expect(imported).not.toContain('useAccountImage');
    expect(read('src/pages/Confirmations/Confirmations.tsx')).toContain('accountId={id}');
    expect(sell).toContain("useAccountImage('icon', accountId, item.confirmation.icon)");
});
