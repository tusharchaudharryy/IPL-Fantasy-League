
require('dotenv').config()
const express = require('express')
const scraper = require('./libs/scraper')
const bodyParser = require('body-parser')
const crypto = require('crypto-js')
const cors = require('cors')



const points = require('./libs/points')

const connection = require('./libs/mongo')
const { Auth } = require('./libs/auth')


const PORT = process.env.PORT || 8000

const app = express()
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json())
app.use(cors())
app.options('*', cors())

const { firebaseAuth, firestore } = require('./libs/firebase')
const mongoose = require('mongoose');

const Player = mongoose.model('Player', mongoose.Schema({ name: String, type: String }));
const SattaStatus = mongoose.model("SattaStatus", mongoose.Schema({ status: Boolean, url: String }));

const userSchema = new mongoose.Schema({
    username: String,
    players: [],
    currScore: Number,
    cumScore: Number,
    sattaLagaDiya: Boolean,
    bonusProgress: Number,
    formIndicator: Number
});

const User = mongoose.model('User', userSchema);


app.get('/matchScores', async (req, res) => {
    let ss = await SattaStatus.find({});
    ss = ss[0];
    var matchurl;
    if (ss.url) {
        matchurl = ss.url;
        scores = await scraper.getScore(matchurl);
        return res.send(scores)
    }
    return res.send("no");
})


app.post('/login', (req, res) => {
    let time = Date()
    firebaseAuth.signInWithEmailAndPassword(req.body.email, req.body.password)
        .then(() => {
            let token = crypto.MD5('/AzIm/' + req.body.email + '*/' + process.env.TOKEN_SALT + '/').toString()
            let authToken = new Auth({ token: token, date: time, valid: true })
            authToken.save()
                .then(async savedToken => {
                    console.log("New login detected")
                    Auth.find({}, (err, result) => {
                        if (err) {
                            console.log(err)
                            res.json({ authenticated: false, token: null })
                            return
                        }
                    })
                    let ss = await SattaStatus.find({});
                    if (ss)
                        ss = ss[0];
                    let sattaOn = false;
                    if (ss.status) {
                        sattaOn = ss.status;
                    }
                    let sattaLagaDiya = false;
                    let user = await User.findOne({ username: req.body.email })
                    if (user) {
                        sattaLagaDiya = user.sattaLagaDiya;
                    }
                    res.json({ authenticated: true, token: token, sattaOn: sattaOn, sattaLagaDiya: sattaLagaDiya });
                    return
                })
                .catch((err) => {
                    console.log(err)
                    console.log("Database save failed")
                    res.json({ authenticated: false, token: null })
                    return
                })
        })
        .catch(() => {
            console.log("Sign in failed")
            res.json({ authenticated: false, token: null })
            return
        })
})

app.post('/createUser', async (req, res) => {
    if (req.body.key == process.env.ADMIN_KEY) {
        firebaseAuth.createUserWithEmailAndPassword(req.body.email, req.body.password);
        const newUser = new User({
            username: req.body.email,
            players: [],
            currScore: 0,
            cumScore: 0,
            sattaLagaDiya: false
        });
        newUser.save((err, resu) => {
            if (err) return res.sendStatus(500);
            return res.sendStatus(201);
        });
    }
    else
        res.sendStatus(401);
});

app.post('/submitSatta', async (req, res) => {
    let token = req.body.token;
    let isValid = await checkauth(req.body.username, token);
    let ss = await SattaStatus.find({});
    if (ss) {
        ss = ss[0]
    }
    if (isValid && ss.status) {
        let selectedPlayers = req.body.players;
        let username = req.body.username;
        let q = await User.updateOne({ username: username }, { players: selectedPlayers, sattaLagaDiya: true });
        if (q.n) {
            return res.json({ "status": "success" });
        }
        return res.json({ "status": "failed" });
    }
    else {
        console.log(401);
        return res.json({ "status": "failed" });
    }
});

app.get('/scores', async (req, res) => {
    let u = await User.find({}, ['username', 'currScore', 'cumScore', 'bonusProgress', 'formIndicator']);
    res.json(u);
});

app.get('/players', async (req, res) => {
    let players = await Player.find({}, ['name', 'type']);
    let data = {};

    data["players"] = players;

    let teams = await User.find({}, ['username', 'players', 'sattaLagaDiya']);
    // console.log(teams);
    data["teams"] = teams;

    res.json(data);
});

app.post('/players', async (req, res) => {
    if (req.body.key == process.env.ADMIN_KEY) {
        let ress = await Player.deleteMany({});
        let players = req.body.players;
        players.forEach((player) => {
            let p = new Player({ name: player.name, type: player.type });
            p.save();
        });
        res.sendStatus(201);
    }
    else
        res.sendStatus(401);
});

app.post('/satta', async (req, res) => {
    if (req.body.key == process.env.ADMIN_KEY) {
        let status = req.body.status;
        if (status == 'ON' || status == 1 || status == 'on') {
            let ress = await User.updateMany({}, { sattaLagaDiya: false });
            ress = await SattaStatus.deleteMany({});
            let sstatus = 1;
            let matchUrl = req.body.matchUrl;
            let newStatus = new SattaStatus({ status: sstatus, url: matchUrl });
            newStatus.save();
            return res.sendStatus(201);
        }
        else if (status == "OFF" || status == 'off' || status == 0) {
            let ress = await SattaStatus.updateMany({}, { status: false });
            return res.sendStatus(201);
        }
    }
    else
        res.sendStatus(401);
});

app.get('/satta', async (req, res) => {
    let ss = await SattaStatus.find({});
    ss = ss[0];
    if (ss.status) {
        return res.send(ss.status);
    }
    res.send("OFF");
});


app.post('/matchEnd', async (req, res) => {
    if (req.body.key !== process.env.ADMIN_KEY) {
        return res.sendStatus(401);
    }

    await SattaStatus.updateMany({}, { status: false, url: "" });

    let users = await User.find({});

    users.sort((a, b) => {
        return b.currScore - a.currScore;
    })

    let rank = users.length;
    let _currScore = []
    let minScore = 10000;

    for (let i = 0; i < users.length; i++) {
        _currScore.push(users[i].currScore)
        if (users[i].currScore === 0) {
            minScore = users[i - 1].currScore;
            rank = i;
            break;
        }
    }

    rank = Math.floor(rank / 2)
    for (let i = 0; i < users.length; i++) {
        satteri = users[i];
        let formIndicator = satteri.formIndicator, bonusProgress = satteri.bonusProgress, currScore = satteri.currScore
        formIndicator += rank

        if (formIndicator > 5) {
            formIndicator = 5;
        } else if (formIndicator < -5) {
            formIndicator = -5
        }


        if (rank >= 0) {
            bonusProgress += rank * 10;
            if (bonusProgress > 100) {
                bonusProgress = 0;
                currScore += 100;
            }
        }

        if (currScore != 0) {
            if (i > 0) {
                currScore += Math.floor((_currScore[i - 1] - _currScore[i]) * 0.7)
            }
        }
        _currScore[i] = currScore;



        let cumScore = satteri.cumScore;
        cumScore += currScore;
        rank--;
        if (satteri.currScore === 0) {
            cumScore += minScore;
            formIndicator = satteri.formIndicator
            bonusProgress = satteri.bonusProgress
        }
        await User.updateOne({ username: satteri.username }, { currScore: 0, cumScore: cumScore, formIndicator: formIndicator, bonusProgress: bonusProgress });
    }
    return res.sendStatus(200);
});


app.post('/sattaLagaDiya', async (req, res) => {
    let username = req.body.username;
    let SLD = await User.find({ username: username }, ['sattaLagaDiya']);
    res.json(SLD[0]);
})

async function calculatePoints() {
    let url = await SattaStatus.find({});
    if (!url || !url[0] || !url[0].url) return;
    url = url[0];

    url = url.url;
    var scoring = {
        "wicket": 20,
        "run": 1,
        "catch": 10,
        "stump": 10,
        "captainMultiplier": 1.5
    };
    let userTeams = {};
    userTeams.matchUrl = url;
    userTeams.users = [];
    let users = await User.find({});
    // console.log("here");
    users.forEach((satteri) => {
        var obj = {};
        obj.username = satteri.username;
        var team = [];
        for (let r = 0; r < satteri.players.length; r++) {
            team.push({ "name": satteri.players[r], "captain": false });
        }
        obj.totalScore = Number.parseInt(satteri.currScore);
        obj.team = team;
        userTeams.users.push(obj);
    });
    let pointsTable = await points.calculate(userTeams, scoring);
    Object.keys(pointsTable).forEach(async (satteri) => {
        // console.log(satteri, pointsTable[satteri].currentScore)
        let upd = await User.updateOne({ username: satteri }, { currScore: pointsTable[satteri].currentScore });
        // console.log(upd.n)
    });
}
calculatePoints();



var checkauth = async (username, token) => {
    let calcToken = crypto.MD5('/AzIm/' + username + '*/' + process.env.TOKEN_SALT + '/').toString();
    var result = false;
    if (calcToken != token) return false;


    let isValid = await Auth.findOne({ token: token }).exec();

    if (isValid) {
        result = true;
    }

    return result;
}

app.listen(PORT, () => {
    console.log(`app league server listening on PORT: ${PORT}`)
})

setInterval(calculatePoints, 60000 - (Math.random() * 10000));


