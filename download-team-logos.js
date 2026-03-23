/**
 * Download team logos from HLTV CDN
 * Run with: node download-team-logos.js
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Team logo mappings from HLTV
const teamLogos = [
    { name: "Vitality", logoUrl: "https://img-cdn.hltv.org/teamlogo/ogcHrcCdzRvxbYvAz04KAN.png?ixlib=java-2.1.0&w=50&s=e1f6019aa9f274ffe45a5e99c88dbc02", folder: "vitality" },
    { name: "FURIA", logoUrl: "https://img-cdn.hltv.org/teamlogo/mvNQc4csFGtxXk5guAh8m1.svg?ixlib=java-2.1.0&s=11e5056829ad5d6c06c5961bbe76d20c", folder: "furia" },
    { name: "Falcons", logoUrl: "https://img-cdn.hltv.org/teamlogo/4eJSkDQINNM6Tbs4WvLzkN.png?ixlib=java-2.1.0&w=50&s=d8c857ea47046f61eca695beab0d12ef", folder: "falcons" },
    { name: "MOUZ", logoUrl: "https://img-cdn.hltv.org/teamlogo/IejtXpquZnE8KqYPB1LNKw.svg?ixlib=java-2.1.0&s=7fd33b8def053fbfd8fdbb58e3bdcd3c", folder: "mouz" },
    { name: "FaZe", logoUrl: "https://img-cdn.hltv.org/teamlogo/J3CwtISw72UEuibqDq0DZt.png?ixlib=java-2.1.0&w=50&s=02a017dc6bced6da74bc8821d1100f4a", folder: "faze" },
    { name: "The MongolZ", logoUrl: "https://img-cdn.hltv.org/teamlogo/bRk2sh_tSTO6fq1GLhgcal.png?ixlib=java-2.1.0&w=50&s=8b08e53858eb817852ae74b30a30151d", folder: "the_mongolz" },
    { name: "Natus Vincere", logoUrl: "https://img-cdn.hltv.org/teamlogo/9iMirAi7ArBLNU8p3kqUTZ.svg?ixlib=java-2.1.0&s=4dd8635be16122656093ae9884675d0c", folder: "natus_vincere" },
    { name: "Spirit", logoUrl: "https://img-cdn.hltv.org/teamlogo/syrtYYKR7sBRw3ZHy1YFX7.png?ixlib=java-2.1.0&w=50&s=40e66714687bec05ea422255b1c0099e", folder: "spirit" },
    { name: "G2", logoUrl: "https://img-cdn.hltv.org/teamlogo/zFLwAELOD15BjJSDMMNBWQ.png?ixlib=java-2.1.0&w=50&s=affb583e6716d8ee904826992255cc4b", folder: "g2" },
    { name: "Aurora", logoUrl: "https://img-cdn.hltv.org/teamlogo/yJzPNOeXlyiniNxanYJCrv.png?ixlib=java-2.1.0&w=50&s=2c08f70c2f2f8c2024a438ddcf19bbf1", folder: "aurora" },
    { name: "B8", logoUrl: "https://img-cdn.hltv.org/teamlogo/O6nRWTCjUzBAR4pcOcrpSG.png?ixlib=java-2.1.0&w=50&s=305dde82e764725dab7e626800328137", folder: "b8" },
    { name: "3DMAX", logoUrl: "https://img-cdn.hltv.org/teamlogo/QGPDS3Z2-aMXwCYVgA4RWH.png?ixlib=java-2.1.0&w=50&s=ec528d7e9d0f9b6b4bac227901fb1590", folder: "3dmax" },
    { name: "paiN", logoUrl: "https://img-cdn.hltv.org/teamlogo/iUUCFwCOFmOrwhB8q8smMg.svg?ixlib=java-2.1.0&s=1446e1cf3d02deb8190fe6efd14e4ce4", folder: "pain" },
    { name: "Astralis", logoUrl: "https://img-cdn.hltv.org/teamlogo/9bgXHp-oh1oaXr7F0mTGmd.svg?ixlib=java-2.1.0&s=f567161ab183001be33948b98c4b2067", folder: "astralis" },
    { name: "Liquid", logoUrl: "https://img-cdn.hltv.org/teamlogo/JMeLLbWKCIEJrmfPaqOz4O.svg?ixlib=java-2.1.0&s=c02caf90234d3a3ebac074c84ba1ea62", folder: "liquid" },
    { name: "Passion UA", logoUrl: "https://img-cdn.hltv.org/teamlogo/N2r90H86RES7-yGZeqREoX.png?ixlib=java-2.1.0&w=50&s=78daf41ce5c011c9a262c108a9209d34", folder: "passion_ua" },
    { name: "Legacy", logoUrl: "https://img-cdn.hltv.org/teamlogo/RWbHH6RA8uGwJurGeLFvSr.png?ixlib=java-2.1.0&w=50&s=3d251032e156cab2f6df8c630ca29745", folder: "legacy" },
    { name: "PARIVISION", logoUrl: "https://img-cdn.hltv.org/teamlogo/6LmMX-SC5VWhlmfE3UO0CB.png?ixlib=java-2.1.0&w=50&s=7769d3dec7b4a737379fcfd760269595", folder: "parivision" },
    { name: "HEROIC", logoUrl: "https://img-cdn.hltv.org/teamlogo/4S22uk_gnZTiQiI-hhH4yp.png?ixlib=java-2.1.0&w=50&s=3619ddf1d490573ab3dc261b8c2f3f6f", folder: "heroic" },
    { name: "SAW", logoUrl: "https://img-cdn.hltv.org/teamlogo/9vOlYp2U_z0vXPb9aLK-4r.png?ixlib=java-2.1.0&w=50&s=22abd048c4d198e504696f27e8ff68d1", folder: "saw" },
    { name: "Imperial", logoUrl: "https://img-cdn.hltv.org/teamlogo/bBDk6-rND06sAzn67b5RdP.png?ixlib=java-2.1.0&w=50&s=467e31ba123f509130d647fbf1e04ef2", folder: "imperial" },
    { name: "Virtus.pro", logoUrl: "https://img-cdn.hltv.org/teamlogo/yZ6Bpuui1rW3jocXQ68XgZ.svg?ixlib=java-2.1.0&s=f39be1d3e7baf30a4e7f0b1216720875", folder: "virtus_pro" },
    { name: "GamerLegion", logoUrl: "https://img-cdn.hltv.org/teamlogo/jS__cj2F09Bl8qBU_CvkQR.png?ixlib=java-2.1.0&w=50&s=11e6eacde0fea931c65c2437b1568027", folder: "gamerlegion" },
    { name: "Ninjas in Pyjamas", logoUrl: "https://img-cdn.hltv.org/teamlogo/-ttGATBV_P_HcZazxNNtIb.png?ixlib=java-2.1.0&w=50&s=ba94f7812d1f47183a83f3f34ab959eb", folder: "ninjas_in_pyjamas" },
    { name: "M80", logoUrl: "https://img-cdn.hltv.org/teamlogo/YsaWwP_VrkbHzuhszuANEK.png?ixlib=java-2.1.0&w=50&s=47a8cff375da8242af9137a2a592b97d", folder: "m80" },
    { name: "Gentle Mates", logoUrl: "https://img-cdn.hltv.org/teamlogo/4vM_jGA-gAmOO3D19rxR1F.png?ixlib=java-2.1.0&w=50&s=e84a0026333c0d681a146ae08e1d318f", folder: "gentle_mates" },
    { name: "FUT", logoUrl: "https://img-cdn.hltv.org/teamlogo/Os71GAOy8KDuQFc0M8HE6O.png?ixlib=java-2.1.0&w=50&s=86f2bded6bcb7c690a42a62250ed69e7", folder: "fut" },
    { name: "Lynn Vision", logoUrl: "https://img-cdn.hltv.org/teamlogo/DPcHT21uWwK1hDD_3txlL9.png?ixlib=java-2.1.0&w=50&s=4b5d5a187f00caf9bbae2d0fcbca6ff6", folder: "lynn_vision" },
    { name: "fnatic", logoUrl: "https://img-cdn.hltv.org/teamlogo/dLtWEdSV58lIX1amAFggy0.svg?ixlib=java-2.1.0&s=f24d0a7b3ef24ed57184a51d35202b4e", folder: "fnatic" },
    { name: "FlyQuest", logoUrl: "https://img-cdn.hltv.org/teamlogo/fmqTgF6Ziw0uied7MO3_ri.png?ixlib=java-2.1.0&w=50&s=255b5a4c460ad03161509ff7eb77b2dc", folder: "flyquest" },
];

const assetsDir = path.join(__dirname, 'public', 'assets', 'teams');

function downloadFile(url, outputPath) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;

        const file = fs.createWriteStream(outputPath);

        const request = protocol.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.hltv.org/'
            }
        }, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                file.close();
                fs.unlinkSync(outputPath);
                downloadFile(response.headers.location, outputPath).then(resolve).catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                file.close();
                fs.unlinkSync(outputPath);
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }

            response.pipe(file);

            file.on('finish', () => {
                file.close();
                resolve();
            });
        });

        request.on('error', (err) => {
            file.close();
            fs.unlink(outputPath, () => { });
            reject(err);
        });
    });
}

async function main() {
    console.log('=== Downloading Team Logos from HLTV ===\n');

    let downloaded = 0;
    let failed = 0;

    for (const team of teamLogos) {
        const teamDir = path.join(assetsDir, team.folder);

        // Create team directory if it doesn't exist
        if (!fs.existsSync(teamDir)) {
            fs.mkdirSync(teamDir, { recursive: true });
        }

        // Determine file extension from URL
        const ext = team.logoUrl.includes('.svg') ? 'svg' : 'png';
        const outputPath = path.join(teamDir, `logo.${ext}`);

        // Skip if already exists
        if (fs.existsSync(outputPath)) {
            console.log(`✓ ${team.name} - already exists`);
            downloaded++;
            continue;
        }

        try {
            await downloadFile(team.logoUrl, outputPath);
            console.log(`✓ ${team.name} - downloaded`);
            downloaded++;
        } catch (err) {
            console.log(`✗ ${team.name} - FAILED: ${err.message}`);
            failed++;
        }

        // Small delay to be nice to the server
        await new Promise(r => setTimeout(r, 200));
    }

    console.log(`\n=== COMPLETE ===`);
    console.log(`Downloaded: ${downloaded}`);
    console.log(`Failed: ${failed}`);
}

main().catch(console.error);
