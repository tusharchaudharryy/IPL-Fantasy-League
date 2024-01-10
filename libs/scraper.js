const cheerio = require('cheerio');
const request = require('request')

/**
 * @todo Try to combine the scoreboard elements to have runs and scores in the same element
 */
 
/**
 * @function parseHtml_cricinfo Parses the given espncricinfo.com HTML code and returns the playerwise scoreboard
 * @param matchHtml The HTML code
*/

function parseScore(html){
    const $ = cheerio.load(html);
    var teams = $('.team');
    var result = {};

    teams.each((index, team)=>{
        var name = team.children[0].children[1].firstChild.children[0].data;
        var score ;
        if(team.children[1].lastChild.children[0]) 
            score = team.children[1].lastChild.children[0].data;

        var overs;

        if(team.children[1].firstChild.children[2]){
            overs = team.children[1].firstChild.children[2].data;
        }
       
        result[name] = {};
        result[name].over = overs;
        result[name].score = score;
    })
    
    return result;
}


exports.getScore = async(url)=>{
    let html = await fetchHtml(url);
    return parseScore(html);
}

function parseHtml_cricinfo(matchHtml) {
    const $ = cheerio.load(matchHtml)
    var batsmenJson = {}
    var bowlersJson = {}
    var batsmen = []
    var bowlers = []
    $(".Collapsible").find(".table.batsman tbody tr").each(function (index, element) {
        batsmen.push(element)
    })
    $(".Collapsible").find(".table.bowler tbody tr").each(function (index, element) {
        bowlers.push(element)
    })
    for (let i = 0; i < batsmen.length; i++) {
        if (batsmen[i].children[0].children[0]) {
            if (batsmen[i].children[0].children[0].children == null) {
                continue;
            }
            var name = batsmen[i].children[0].children[0].children[0].data
            if (name.includes(' †')) {
                name = name.split(' †')[0]
            }
            if (name.includes(' (c)')) {
                name = name.split(' (c)')[0]
            }
            var batsmanJson = {
                name: name,
                runs: batsmen[i].children[2].children[0].data
            }
            batsmenJson[batsmanJson.name] = batsmanJson
        }
    }
    for (let i = 0; i < bowlers.length; i++) {
        if (bowlers[i].children[0].children[0]) {
            if (bowlers[i].children[0].children[0].children == null) {
                continue;
            }
            else if (bowlers[i].children[4] == null){
                continue
            }
            var name = bowlers[i].children[0].children[0].children[0].data
            if (name.includes(' †')) {
                name = name.split(' †')[0]
            }
            if (name.includes(' (c)')) {
                name = name.split(' (c)')[0]
            }
            var bowlerJson = {
                name: name,
                wickets: bowlers[i].children[4].children[0].data
            }
            bowlersJson[bowlerJson.name] = bowlerJson
        }
    }
    var scorecard = {
        batsmen: batsmenJson,
        bowlers: bowlersJson
    }
    // console.log(scorecard)
    return scorecard;

}


async function parseHtml_cricbuzz(HTML) {
    const $ = cheerio.load(HTML)
    let batsmen = []
    let bowlers = []
    let batsmenJson = {}
    let bowlersJson = {}

    $("#innings_1").find("[class~='cb-ltst-wgt-hdr']:nth-of-type(1)").find("[class~='cb-scrd-itms']").each((index, batsman) => {
        if (batsman.children[1].children[1]) {
            batsmen.push(batsman)
        }
    })
    $("#innings_1").find("[class~='cb-ltst-wgt-hdr']:nth-of-type(4)").find("[class~='cb-scrd-itms']").each((index, bowler) => {
        if (bowler.children[1].children[1]) {
            bowlers.push(bowler)
        }
    })
    $("#innings_2").find("[class~='cb-ltst-wgt-hdr']:nth-of-type(1)").find("[class~='cb-scrd-itms']").each((index, batsman) => {
        if (batsman.children[1].children[1]) {
            batsmen.push(batsman)
        }
    })
    $("#innings_2").find("[class~='cb-ltst-wgt-hdr']:nth-of-type(4)").find("[class~='cb-scrd-itms']").each((index, bowler) => {
        if (bowler.children[1].children[1]) {
            bowlers.push(bowler)
        }
    })
    for (let i = 0; i < batsmen.length; i++) {
        let name = batsmen[i].children[1].children[1].children[0].data.substr(1)
        let batsmanJson = { name: name, runs: batsmen[i].children[5].children[0].data }
        batsmenJson[name] = batsmanJson
    }
    for (let i = 0; i < bowlers.length; i++) {
        let name = bowlers[i].children[1].children[1].children[0].data.substr(1)
        let bowlerJson = { name: name, wickets: bowlers[i].children[9].children[0].data }
        bowlersJson[name] = bowlerJson
    }

    let scoreboard = { batsmen: batsmenJson, bowlers: bowlersJson }
    // Squads
    let players = { team1: [], team2: [] }
    //BUG: nth-of-type selector doesn't work for some reason, and there is currently no way to differentiate benched and other players.
    $("[class~='cb-minfo-tm-nm']").find("[class='margin0 text-black text-hvr-underline']").each((index, player) => {
        if (index < 11)
            players.team1.push(player.children[0].data)
        else if (index > 11 && index < 27)
            players.team2.push(player.children[0].data)
    })
    console.log(players)
}

/**
 * @function fetchHtml Returns the HTML code of the given url
 * @param matchUrl URL.
 */
async function fetchHtml(matchUrl) {
    return new Promise((resolve, reject) => {
        request.get(matchUrl, (err, response, html) => {
            if (err) {
                throw err
            }
            resolve(html)
        })
    })
}

/**
 * @function cricinfoWorker driver function to scrape scores from espncricinfo
 * @param matchUrl URL of the match to be scraped
*/
exports.cricinfoWorker = async (matchUrl) => {
    let HTML = await fetchHtml(matchUrl)
    return parseHtml_cricinfo(HTML)
}

exports.cricbuzzWorker = async (matchId) => {
    /** 
     * @function cricbuzzWorker driver function to scrape scores and teams from cricbuzz
     * @param matchId cricbuzz matchId from URL
    */
    let url = `https://www.cricbuzz.com/api/html/cricket-scorecard/${matchId}`
    let HTML = await fetchHtml(url)
    parseHtml_cricbuzz(HTML)
}
