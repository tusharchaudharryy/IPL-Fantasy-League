const mongoose = require('mongoose')

var userSchema = new mongoose.Schema({
    username: String, 
    players: [],
    currScore : Number,
    cumScore : Number,
    bonusProgress: Number,
    formIndicator: Number 
});

 
module.exports.User = mongoose.model('User', userSchema)
