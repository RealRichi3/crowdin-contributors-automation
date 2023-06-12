require('dotenv').config()
const axios = require('axios')
const fs = require('fs');
const https = require('https');
const project_file = require('./crowdin_contributors_report.json')

// Config
const CONFIG = process.env,
    CROWDIN_PROJECT_ID = CONFIG.CROWDIN_PROJECT_ID,
    CROWDIN_AUTH_TOKEN = CONFIG.CROWDIN_TOKEN,
    TTW_CROWDIN_API_DOMAIN = CONFIG.CROWDIN_ORG_API_DOMAIN,
    MINIMUM_WORDS_TRANSLATED = parseInt(CONFIG.MINIMUM_WORDS_TRANSLATED, 10),
    START_MARKER = CONFIG.START_MARKER,
    END_MARKER = CONFIG.END_MARKER,
    WAIT_TIME = parseInt(CONFIG.WAIT_TIME)

const FILE_FORMAT = 'json'
const auth_header = {
    headers: {
        'Authorization': 'Bearer ' + CROWDIN_AUTH_TOKEN,
        'Content-Type': 'application/json',
    },
}

function parseUserDataToHTML(user_data) {
    const {
        fullname,
        picture,
        username,
        languages_translated,
        no_of_words_approved,
        no_of_words_translated
    } = user_data

    console.log(user_data)

    const user_profile = `<img alt="logo" style="width: ${100}px" src="${picture}"/>
                            <br />
                            <sub><b>${fullname}</b></sub>`
    const wrapped_user_data = `<a href="https://crowdin.com/profile/${username}">${user_profile}</a>`

    return `<td align="center" display="flex" flex-direction="column" justify-content="space-between">
            ${wrapped_user_data}
            <br />
            <sub><b>(${languages_translated})</b></sub></br>
            <sub><b>${no_of_words_translated} words translated </b></sub> 
            <br />
            <sub><b>${no_of_words_approved} words approved </b></sub>
            </td>`
}

function generateTableHTML() {
    // should update the readme file with the report
    const contributors_data = project_file.data

    let html = '<table>';

    const contributors_per_line = 5;
    const total_contributors = contributors_data.length;

    for (let i = 0; i < total_contributors; i += contributors_per_line) {
        html += '<tr>';

        for (let j = i; j < i + contributors_per_line && j < total_contributors; j++) {
            const contributor_info = contributors_data[j];
            const {
                fullName: fullname, username,
                avatarUrl: picture
            } = contributor_info.user;
            const {
                languages,
                translated: no_of_words_translated,
                approved: no_of_words_approved
            } = contributor_info;

            const valid_contribution = no_of_words_translated >= MINIMUM_WORDS_TRANSLATED;
            if (!valid_contribution) continue;

            const languages_translated = languages.map((lang) => lang.id.toUpperCase()).join(', ');
            const user_data = {
                fullname, picture,
                username, languages_translated,
                no_of_words_approved, no_of_words_translated
            }

            html += parseUserDataToHTML(user_data);
        }

        html += '</tr>';
    }

    return html;
}

async function updateReadme(table_html) {
    const readme_file = 'README.md';
    fs.readFile(readme_file, 'utf8', (err, data) => {
        if (err) console.error(`Error reading file: ${err}`);
        else {
            const start_index = data.indexOf(START_MARKER);
            const end_index = data.indexOf(END_MARKER);

            const reference_project_url = project_file.url;
            const html_reference = `<h2><b>Crowdin contributors</h2></br>
                                    <h3><b><a href="${reference_project_url}">Project link</a></b>`

            if (start_index !== -1 && end_index !== -1) {
                const updated_content =
                    data.substring(0, start_index + START_MARKER.length) +
                    '\n' +
                    table_html +
                    '\n' +
                    html_reference +
                    '\n' +
                    data.substring(end_index);

                fs.writeFile(readme_file, updated_content, (err) => {
                    err
                        ? console.error(`Error writing file: ${err}`)
                        : console.log('message', 'Markdown file updated successfully.')
                });
            }
            else console.error(`Start and/or end markers not found in the file "${readme_file}".`)
        }

        // Delete the report file
        fs.unlink('crowdin_contributors_report.json', (err) => {
            if (err) console.error(`Error deleting file: ${err}`);
            else console.log('message', 'Report file deleted successfully.')
        });
    });
}

async function generateProjectReport() {
    // Generate project report
    const generate_report_endpoint = `${TTW_CROWDIN_API_DOMAIN}/projects/${CROWDIN_PROJECT_ID}/reports`
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

    return { report_id }
}

async function downloadProjectReport(url) {
    const file = fs.createWriteStream('crowdin_contributors_report' + `.${FILE_FORMAT}`);

    https.get(url, response => {
        response.pipe(file);
    });

    console.log('Project report downloaded and saved successfully.');
}

async function getProjectReportDownloadURL(report_id) {
    // Get project report
    const get_report_endpoint = `${TTW_CROWDIN_API_DOMAIN}/projects/${CROWDIN_PROJECT_ID}/reports/${report_id}/download`
    const report_response =
        await axios.get(
            get_report_endpoint,
            auth_header,
        ).then(r => r).catch(e => e)

    const file_download_url = report_response.data.data.url

    return file_download_url
}

async function start() {
    const { report_id } = await generateProjectReport()
    
    // Report takes less than 10 seconds to generate
    setTimeout(() => {
        async function processProjectReport() {
            const file_download_url = await getProjectReportDownloadURL(report_id)
            await downloadProjectReport(file_download_url)

            const table_html = generateTableHTML()
            await updateReadme(table_html)
        }

        processProjectReport().catch((error) => {
            console.error(error)
            process.exit(1)
        })
    }, WAIT_TIME || 10000)
}

start()
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
