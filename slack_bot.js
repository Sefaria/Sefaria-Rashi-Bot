/*~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 ______     ______     ______   __  __     __     ______
 /\  == \   /\  __ \   /\__  _\ /\ \/ /    /\ \   /\__  _\
 \ \  __<   \ \ \/\ \  \/_/\ \/ \ \  _"-.  \ \ \  \/_/\ \/
 \ \_____\  \ \_____\    \ \_\  \ \_\ \_\  \ \_\    \ \_\
 \/_____/   \/_____/     \/_/   \/_/\/_/   \/_/     \/_/


 This is a sample Slack bot built with Botkit.

 This bot demonstrates many of the core features of Botkit:

 * Connect to Slack using the real time API
 * Receive messages based on "spoken" patterns
 * Reply to messages
 * Use the conversation system to ask questions
 * Use the built in storage system to store and retrieve information
 for a user.

 # RUN THE BOT:

 Get a Bot token from Slack:

 -> http://my.slack.com/services/new/bot

 Run your bot from the command line:

 token=<MY TOKEN> node slack_bot.js

 # USE THE BOT:

 Find your bot inside Slack to send it a direct message.

 Say: "Hello"

 The bot will reply "Hello!"

 Say: "who are you?"

 The bot will tell you its name, where it is running, and for how long.

 Say: "Call me <nickname>"

 Tell the bot your nickname. Now you are friends.

 Say: "who am I?"

 The bot will tell you your nickname, if it knows one for you.

 Say: "shutdown"

 The bot will ask if you are sure, and then shut itself down.

 Make sure to invite your bot into other channels using /invite @<my bot>!

 # EXTEND THE BOT:

 Botkit has many features for building cool and useful bots!

 Read all about it here:

 -> http://howdy.ai/botkit

 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~*/
var request = require('request');
var slackify = require('slackify-html');


if (!process.env.token) {
    console.log('Error: Specify token in environment');
    process.exit(1);
}

var Botkit = require('botkit')
var os = require('os');

var controller = Botkit.slackbot({
    debug: true,
});

var bot = controller.spawn({
    token: process.env.token
}).startRTM();

controller.hears(['hello', 'hi', 'hey'], 'direct_message,direct_mention,mention', function(bot, message) {

    bot.api.reactions.add({
        timestamp: message.ts,
        channel: message.channel,
        name: 'robot_face',
    }, function(err, res) {
        if (err) {
            bot.botkit.log('Failed to add emoji reaction :(', err);
        }
    });


    controller.storage.users.get(message.user, function(err, user) {

        bot.createConversation(message, function(err, convo) {

            convo.addQuestion('Ok {{vars.nickname}}, what pasuk do you want to learn today?', function(res, convo) {

                convo.say('Ok, one second, let me find that one.');
                var url = 'https://www.sefaria.org/api/texts/' + res.text + '?context=0&commentary=1';

                request(url, function(err, response, json) {

                    var data = JSON.parse(json);

                    if (data.text || data.he) {
                        convo.transitionTo('confirmText', '```' + slackify(data.text) + '```\n```' + slackify(data.he) + '```');

                        convo.setVar('ref', data.ref);
                        convo.setVar('commentary', data.commentary);

                    } else {
                        convo.say('I am having trouble finding that one.');
                        convo.repeat();
                        convo.next();
                    }


                });

            }, {key: 'reference'}, 'askPasuk');


            convo.addQuestion('This text?', [
                {
                    pattern: bot.utterances.yes,
                    callback: function(response, convo) {

                        var rashisOnVerse = [];
                        for (var link in convo.vars.commentary) {
                            if (convo.vars.commentary[link].ref.indexOf('Rashi') != -1) {
                                rashisOnVerse.push(convo.vars.commentary[link]);
                            }
                        }

                        var transitionStatement;

                        if (rashisOnVerse.length == 0) {
                            transitionStatement = 'I have nothing to say about that pasuk.';
                        } else if (rashisOnVerse.length == 1) {
                            transitionStatement = 'I have one thought on this pasuk';
                        } else if (rashisOnVerse.length == 2) {
                            transitionStatement = 'I have a couple of things to say about this pasuk.';
                        } else if (rashisOnVerse.length > 2) {
                            transitionStatement = 'I have so many things to say about this pasuk.';
                        }

                        convo.setVar('RashiArray', rashisOnVerse);
                        convo.setVar('curRashi', convo.vars.RashiArray.shift());


                        convo.transitionTo('newRashi', transitionStatement);


                    }
                },
                {
                    pattern: bot.utterances.no,
                    callback: function(response, convo) {
                        convo.say('ok sorry!');
                        convo.gotoThread('askPasuk');
                    }
                },
                {
                    default: true,
                    callback: function(response, convo) {
                        // just repeat the question
                        convo.repeat();
                        convo.next();
                    }
                }
            ], {}, 'confirmText');


            convo.beforeThread('newRashi', function(convo, next) {
                convo.setVar('curHeRashi', slackify(convo.vars.curRashi.he));
                convo.setVar('curEnRashi', slackify(convo.vars.curRashi.text));
                //convo.setVar('rashiTorahLinks', curEnRashi.match(/Genesis \d+:\d+|Exodus \d+:\d+|Deuteronomy \d+:\d+|Numbers \d+:\d+|Leviticus \d+:\d+/g);
                next();
            });

            convo.addQuestion('```{{ vars.curEnRashi }}``` \n ```{{ vars.curHeRashi }}```\nWhat\'s bothering me about this pasuk?', [
                {
                    default: true,
                    callback: function(response, convo) {
                        convo.setVar('rashiLoopCount', 0);
                        var questions = ['Tell me more', 'thats so interesting! Go on.', 'Can you explain that a little more?'];
                        convo.setVar('nextQuestion', questions[Math.floor(Math.random() * 2)]);

                        convo.gotoThread('rashiLoop');
                    }
                }
            ], {}, 'newRashi');


            convo.beforeThread('rashiLoop', function(convo, next) {
                convo.setVar('rashiLoopCount', convo.vars.rashiLoopCount + 1);
                next();
            });

            convo.addQuestion('{{vars.nextQuestion}}', [
                {
                    pattern: new RegExp(/^(.+think.+|.+wonder.+)/i),
                    callback: function(response, convo) {
                        var questions = ['What makes you think that?', 'Do you really think so?', 'But you are not sure?'];
                        convo.setVar('nextQuestion', questions[Math.floor(Math.random() * 2)]);
                        convo.gotoThread('rashiLoop');
                    }
                },

                {
                    default: true,
                    callback: function(response, convo) {
                        if (convo.vars.rashiLoopCount > 0) {
                            convo.gotoThread('moreToSay');
                        }
                        else {
                            var questions = ['Tell me more', 'Please go on.', 'Can you explain that a little more?', 'I\'m not sure I understand you fully', 'Can you think of another answer to this question?'];
                            convo.setVar('nextQuestion', questions[Math.floor(Math.random() * 2)]);
                            convo.gotoThread('rashiLoop');
                        }
                    }
                }
            ], {}, 'rashiLoop');


            convo.addQuestion('Do you have anything else you want to add?', [
                {
                    pattern: bot.utterances.yes,
                    callback: function(response, convo) {
                        convo.setVar('nextQuestion', "Go on...");
                        convo.gotoThread('rashiLoop');
                    }
                },

                {
                    pattern: bot.utterances.no,
                    callback: function(response, convo) {
                        if (convo.vars.RashiArray.length > 0) {
                            convo.setVar('curRashi', convo.vars.RashiArray.shift());
                            convo.transitionTo('newRashi',"Well I have more to say on the pasuk.");
                        }
                        else {
                            convo.next();
                        }
                    }
                },


                {
                    default: true,
                    callback: function(response, convo) {
                        convo.repeat();
                        convo.next();
                    }
                }
            ], {}, 'moreToSay');



            convo.addQuestion('Who am I learning with today?', function(res, convo) {
                convo.addMessage('Great.');
                convo.gotoThread('confirmName');
            }, {key: 'nickname'}, 'askName');


            convo.beforeThread('confirmName', function(convo, next) {
                var name = convo.extractResponse('nickname');
                convo.setVar('nickname', name);
                next();
            });


            convo.addQuestion('You want me to call you `{{vars.nickname}}`?', [
                {
                    pattern: bot.utterances.yes,
                    callback: function(response, convo) {
                        convo.say('Great!');
                        // do something else...
                        convo.gotoThread('askPasuk');
                    }
                },
                {
                    pattern: bot.utterances.no,
                    callback: function(response, convo) {
                        convo.say('ok sorry!');
                        // do something else...
                        convo.stop();
                    }
                },
                {
                    default: true,
                    callback: function(response, convo) {
                        // just repeat the question
                        convo.repeat();
                        convo.next();
                    }
                }
            ], {}, 'confirmName');


            if (user && user.name) {
                convo.transitionTo('askPasuk', 'Hello ' + user.name + '!');
            } else {
                convo.transitionTo('askName', 'Hello.');
            }


            convo.on('end', function(convo) {
                if (convo.status == 'completed') {

                    bot.reply(message, 'OK! Thanks for learning with me!');

                } else {
                    // this happens if the conversation ended prematurely for some reason
                    bot.reply(message, 'OK, sorry to bother you!');
                }
            });

            convo.activate();

        });


    });
});


controller.hears(['call me (.*)', 'my name is (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var name = message.match[1];
    controller.storage.users.get(message.user, function(err, user) {
        if (!user) {
            user = {
                id: message.user,
            };
        }
        user.name = name;
        controller.storage.users.save(user, function(err, id) {
            bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.');
        });
    });
});


controller.hears(['shutdown'], 'direct_message,direct_mention,mention', function(bot, message) {

    bot.startConversation(message, function(err, convo) {

        convo.ask('Are you sure you want me to shutdown?', [
            {
                pattern: bot.utterances.yes,
                callback: function(response, convo) {
                    convo.say('Bye!');
                    convo.next();
                    setTimeout(function() {
                        process.exit();
                    }, 3000);
                }
            },
            {
                pattern: bot.utterances.no,
                default: true,
                callback: function(response, convo) {
                    convo.say('*Phew!*');
                    convo.next();
                }
            }
        ]);
    });
});


controller.hears(['uptime', 'identify yourself', 'who are you', 'what is your name'],
    'direct_message,direct_mention,mention', function(bot, message) {

        var hostname = os.hostname();
        var uptime = formatUptime(process.uptime());

        bot.reply(message,
            ':robot_face: I am a bot named <@' + bot.identity.name +
             '>. I have been running for ' + uptime + ' on ' + hostname + '.');

    });

function formatUptime(uptime) {
    var unit = 'second';
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'minute';
    }
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'hour';
    }
    if (uptime != 1) {
        unit = unit + 's';
    }

    uptime = uptime + ' ' + unit;
    return uptime;
}