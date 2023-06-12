require('dotenv').config()
const core = require('@actions/core');
const axios = require('axios')
const fs = require('fs');
const https = require('https');
const project_file = require('./crowdin_contributors_report.json')
const pretty = require('pretty')

// Config
const CONFIG = process.env
const MINIMUM_WORDS_CONTRIBUTED = CONFIG.MINIMUM_WORDS_CONTRIBUTED
const CROWDIN_PROJECT_ID = CONFIG.CROWDIN_PROJECT_ID
const CROWDIN_AUTH_TOKEN = CONFIG.CROWDIN_TOKEN
const TTW_CROWDIN_API_DOMAIN = CONFIG.CROWDIN_ORG_API_DOMAIN
const WAIT_TIME = parseInt(CONFIG.WAIT_TIME)
const FILE_FORMAT = 'json'

const auth_header = {
    headers: {
        'Authorization': 'Bearer ' + CROWDIN_AUTH_TOKEN,
        'Content-Type': 'application/json',
    },
}

function getContributorsData() {

}

async function updateReadme() {
    // should update the readme file with the report
    const contributors_data = project_file.data
    // let table = `<table>
    // <thead>
    //   <tr>
    //     <th>S/N</th>
    //     <th>Profile</th>
    //     <th>Full Name</th>
    //     <th>Crowdin Username</th>
    //     <th>Words Translated</th>
    //     <th>Languages</th>
    //   </tr>
    // </thead>
    // <tbody>`;
    let html = '<table>';

    // for (let i = 0; i < report.length; i += this.config.contributorsPerLine) {
    //     result.push(report.slice(i, i + this.config.contributorsPerLine));
    // }

    // for (let i in result) {
    // }


    const contributorsPerLine = 5;
    const totalContributors = contributors_data.length;

    for (let i = 0; i < totalContributors; i += contributorsPerLine) {
        html += '<tr>';

        for (let j = i; j < i + contributorsPerLine && j < totalContributors; j++) {
            const contributor_info = contributors_data[j];
            const { fullName: fullname, username, avatarUrl } = contributor_info.user;
            const { languages, translated: no_of_words_translated, approved } = contributor_info;

            const languages_translated = languages.map((lang) => lang.name).join(', ');

            let userData = `<img alt="logo" style="width: ${100}px" src="${avatarUrl}"/>
                        <br />
                        <sub><b>${fullname}</b></sub>`;

            userData = `<a href="https://crowdin.com/profile/${username}">${userData}</a>`;

            html += `<td align="center" valign="top">
                      ${userData}
                      <br />
                      <sub><b>${+no_of_words_translated + +approved} words</b></sub>
                  </td>`;
        }

        html += '</tr>';
    }

    const table = pretty(html);

    const readme_file = 'README.md';
    fs.readFile(readme_file, 'utf8', (err, data) => {
        if (err) {
            console.error(`Error reading file: ${err}`);
        } else {
            const startMarker = '<!-- CROWDIN-CONTRIBUTORS-LIST:START -->';
            const endMarker = '<!-- CROWDIN-CONTRIBUTORS-LIST:END -->';
            const startIdx = data.indexOf(startMarker);
            const endIdx = data.indexOf(endMarker);

            console.log(startIdx, endIdx);

            if (startIdx !== -1 && endIdx !== -1) {
                const updatedContent =
                    data.substring(0, startIdx + startMarker.length) +
                    '\n' +
                    table +
                    '\n' +
                    data.substring(endIdx);

                fs.writeFile(readme_file, updatedContent, (err) => {
                    if (err) {
                        console.error(`Error writing file: ${err}`);
                    } else {
                        console.log(`Markdown file "${readme_file}" updated successfully.`);
                    }
                });
            } else {
                console.error(
                    `Start and/or end markers not found in the file "${readme_file}".`
                );
            }
        }
    });
}

async function downloadProjectReport(url) {
    const file = fs.createWriteStream('crowdin_contributors_report' + '.' + FILE_FORMAT);
    https.get(url, response => {
        response.pipe(file);
    });

    console.log('Project report downloaded and saved successfully.');
}

async function start() {
    // Generate project report
    const generate_report_endpoint = TTW_CROWDIN_API_DOMAIN + `/projects/${CROWDIN_PROJECT_ID}/reports`
    console.log(generate_report_endpoint)
    const response = await axios.post(
        generate_report_endpoint,
        {
            name: "top-members",
            schema: {
                unit: 'words',
                format: FILE_FORMAT,
                dateFrom: "2020-01-01T00:00:00Z",
                dateTo: "2023-06-06T00:00:00Z",
            }
        },
        auth_header,
    ).then(r => r)

    const report_id = response.data.data.identifier

    // Report takes less than 10 seconds to generate
    setTimeout(() => {
        // Get project report
        async function processProjectReport() {
            const get_report_endpoint = TTW_CROWDIN_API_DOMAIN + `/projects/${CROWDIN_PROJECT_ID}/reports/${report_id}/download`
            const report_response = await axios.get(
                get_report_endpoint,
                auth_header,
            ).then(r => r).catch(e => e)

            const file_download_url = report_response.data.data.url

            await downloadProjectReport(file_download_url)
            await updateReadme()
        }

        processProjectReport().catch((error) => {
            console.log(error)
            process.exit(1)
        })
    }, WAIT_TIME || 10000)
}

start()
    .catch((error) => {
        console.log(error)
        process.exit(1)
    })
