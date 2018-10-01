var app = require('express')();
var async = require('async');
var aws = require('aws-sdk');
var http = require('http').Server(app);
var io = require('socket.io').listen(
    app.listen(8889),
    {
       'pingInterval': 2000,
       'pingTimeout': 5000
    }
);
var mongoose = require('mongoose')
var users = {};
var chatusers = {};

/*
var dbfile = '../db.sqlite3';
var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.Database(dbfile);
*/

var redis = require('redis');
var redis_client = redis.createClient();

redis_client.on('connect', function() {
    console.log('redis connected');
});

var config = require('./config');

aws.config.update({ accessKeyId: config.aws.accessKeyId, secretAccessKey: config.aws.secretAccessKey });

var s3 = new aws.S3();

var pg = require('pg');
var pgUser = config.pg.username;
var pgPassword = config.pg.password;
var pgHost = config.pg.host;

var pgConfig = {
    user: pgUser,
    database: 'postgres',
    host: pgHost,
    password: pgPassword,
    port: 5432
};

/** redis
var redis = require('redis');
var sub = redis.createClient();

sub.on('connect', function(){
  console.log('first channel connection');
});

  sub.del('framework', function(err, reply){
     console.log(reply);
  });

  var d = new Date();
  console.log('date:'+d); 

  sub.set(d,{
     'message':'Hello'}, function(err, reply){
     console.log(reply);
  });
redis **/

var mongoHost = config.mongo.host;

mongoose.connect(`mongodb://${mongoHost}/communitypost`, function(err){
    if (err){
        console.log(err);
    } else{
        console.log('connected to mongo');
    }
});

var replySchema = mongoose.Schema({
    user: {uid: String, first_name: String, last_name: String},
    content: String,
    created: {type: Date, default:Date.now}
});

var communitySchema = mongoose.Schema({
    user: {uid: String, first_name: String, last_name: String},
    content: String,
    portfolio : { image: String, title: String, description: String},
    upcoming : { image: String, title: String, description: String},
    image: { data: Boolean, contentType: String },
    replys: [replySchema],
    skillls: [String],
    tag: Number,//1: Yes, -1: No
    communityFlag: Number,//0: public, 1: private 
    sharedBy: Number,
    likes: Number,
    shares: Number,
    content_id: String,
    created: {type: Date, default:Date.now}
});

var CommunityPost = mongoose.model('CommunityPost', communitySchema);

var commentSchema = mongoose.Schema({
    to_uid: String,
    from_user: {uid: String, first_name: String, last_name: String},
    content: String,
    created: {type: Date, default:Date.now}
});

var CommentPost = mongoose.model('CommentPost', commentSchema);

// action id  1:comment, 2:hatsoff, 3:shareskill, 4:like, 5:share, 6:thanks, 7:collaborate, 8:follow
var notificationSchema = mongoose.Schema({
    to_uid: String,
    action_user: {uid: String, first_name: String, last_name: String},
    action_id: Number,
    content_type: Number,
    content_id: String,
    created: {type: Date, default:Date.now}
});

var NotificationPost = mongoose.model('NotificationPost', notificationSchema);

var upcomingSchema = mongoose.Schema({
    to_uid: String,
    user: {uid: String, first_name: String, last_name: String},
    content: String,
    created: {type: Date, default:Date.now}
});

var UpcomingPost = mongoose.model('UpcomingPost', upcomingSchema);

var portfolioSchema = mongoose.Schema({
    to_uid: String,
    p_id: Number,
    user: {uid: String, first_name: String, last_name: String},
    content: String,
    created: {type: Date, default:Date.now}
});

var PortfolioPost = mongoose.model('PortfolioPost', portfolioSchema);

var shareskillSchema = mongoose.Schema({
    to_uid: String,
    user: {uid: String, first_name: String, last_name: String},
    community_id: String,
    created: {type: Date, default:Date.now}
});

var ShareSkillPost = mongoose.model('ShareSkillPost', shareskillSchema);

var collaborateSchema = mongoose.Schema({
    to_uid: String,
    user: {uid: String, first_name: String, last_name: String},
    content_type: Number,
    content_id: String,
    created: {type: Date, default:Date.now}
});

var CollaboratePost = mongoose.model('CollaboratePost', collaborateSchema);

var likeSchema = mongoose.Schema({
    to_uid: String,
    user: {uid: String, first_name: String, last_name: String},
    content_type: Number,
    content_id: String,
    created: {type: Date, default:Date.now}
});
// content_type 1:community post 2:upcoming work 3:portfolio 4:shared post

var LikePost = mongoose.model('LikePost', likeSchema);

var ShareSchema = mongoose.Schema({
    to_uid: String,
    user: {uid: String, first_name: String, last_name: String},
    content_type: Number,
    content_id: String,
    created: {type: Date, default:Date.now}
});
// content_type 1:community post

var SharePost = mongoose.model('SharePost', ShareSchema);

var thanksSchema = mongoose.Schema({
    to_uid: String,
    user: {uid: String, first_name: String, last_name: String},
    created: {type: Date, default:Date.now}
});
// content_type 1:community post

var ThanksPost = mongoose.model('ThanksPost', thanksSchema);

//Status 1:only action user follows, 2:follow each other 
var followSchema = mongoose.Schema({
    uid1: String,
    uid2: String,
    action_user: Number,//1 or 2
    status: Number,//1: sent request, 2:accepted, 3:blocked
    //to_uid: Number,
    //user: {uid: Number, first_name: String, last_name: String},
    created: {type: Date, default:Date.now}
});
// content_type 1:community post

var FollowPost = mongoose.model('FollowPost', followSchema);

var hatsoffSchema = mongoose.Schema({
    to_uid: String,
    content_type: Number,
    content_id: String,
    user: {uid: String, first_name: String, last_name: String},
    created: {type: Date, default:Date.now}
});

// content_type 1:community post 2:upcoming work 3:portfolio 4:shared post 5:profile
var HatsoffPost = mongoose.model('HatsoffPost', hatsoffSchema);

var messageSchema = mongoose.Schema({
    uid: String,
    content: String,//1: sent request, 2:accepted, 3:blocked
    image: { data: Buffer, contentType: String },
    created: {type: Date, default:Date.now}
});

var MessagePost = mongoose.model('MessagePost', messageSchema);

var messageRelationSchema = mongoose.Schema({
    uid1: String,
    uid2: String,
    action_user: Number,//1 or 2
    status: Number,//1: sent request, 2:accepted, 3:blocked
    messages: [messageSchema],
    created: {type: Date, default:Date.now}
});
// content_type 1:community post

var MessageRelation = mongoose.model('MessageRelation', messageRelationSchema);

var communityMemberSchema = mongoose.Schema({
    uid: String,
    friends: [Number],
    created: {type: Date, default:Date.now}
});
// content_type 1:community post

var CommunityMember = mongoose.model('CommunityMember', communityMemberSchema);

io.on('connection', function(socket){

    socket.on('join message', function(data){
        /*
        PortfolioPost.find({p_id:2}).remove().exec();
        PortfolioPost.find({}).remove().exec();
        */

        socket.uid = data.uid;
        socket.firstname = data.firstname;
        socket.lastname = data.lastname;
        users[socket.uid] = socket;
        updateUids();
    });

    socket.on('list users at signup', function(query){
        var pool = new pg.Pool(pgConfig);

        try { 
            pool.connect(function(err, client, release) {
                var profession_query = `
                  SELECT week1_user.uid as user_id, week1_user.first_name, week1_user.last_name, week1_profile.photo,
                   week1_profile.profession1, week1_profile.profession2, week1_profile.profession3, week1_profile.describe
                  FROM week1_profile, week1_user
                  WHERE week1_user.uid!='${socket.uid}' AND week1_profile.user_id=week1_user.id
                `;

                client.query(profession_query, function(err, result){
                    release();
                    if (err) {
                        return console.error('Error executing query', err.stack)
                    }
                    socket.emit('get users list', result.rows);
                });
            });
        } catch(error) {
            console.log("Error at list users at signup:", error); 
        }
    });


    socket.on('join chat', function(data){
        socket.uid = data.uid;
        socket.firstname = data.firstname;
        socket.lastname = data.lastname;
        chatusers[socket.uid] = socket;
        updatechatUids();
    });

    socket.on('at community members', function(data){
        try {
            CommunityMember.findOne({uid:socket.uid}).exec(function(err, result){
                if (result) {
                    var friends = result.friends;
                    var tuplestr = "(";
                    for (var i = 0; i < friends.length; i++){
                        tuplestr += "?,";
                    }
                    tuplestr = tuplestr.substring(0, tuplestr.length - 1);
                    tuplestr += ")";

                    var liststr = "('"+friends.join("','")+"')";
                    var query = `
                      SELECT
                         DISTINCT week1_profile.user_id, auth_user.first_name, auth_user.last_name, week1_profile.photo, week1_profile.profession1,
                            week1_profile.profession2, week1_profile.profession3, week1_profile.describe
                      FROM week1_user, week1_profile
                      WHERE week1_profile.user_id==week1_user.id AND week1_profile.user_id in ${liststr}
                      `
                    var pool = new pg.Pool(pgConfig);

                    pool.connect(function(err, client, release) {
                        client.query(query, function(err, result){
                            release();
                            if (err) {
                                return console.error('Error executing query', err.stack)
                            }
                            socket.emit('get community members', result.rows);
                        });
                    });
                    pool.end()
                }
            });
        } catch(error){
            console.log("Error at community members:", error); 
        }
    });

    socket.on('join community', function(data){
        try {
            var query = CommunityPost.find({});

            key = "community_"+socket.uid;

            var currentDate = new Date();
            var is_sent = false;

            redis_client.exists(key, function(err, reply) {
                if (reply === 1) {
                    redis_client.hgetall(key, function(err, data) {
                        var diffMs = currentDate - data.last_update;
                        var diffMins = Math.round(((diffMs % 86400000) % 3600000) / 60000);
                        if (diffMins > 2){
                            socket.emit('update community post', data);
                            is_sent = true;
                        }
                    });
                }

                if (!is_sent) {
                    query.sort('-created').limit(30).exec(function(err, docs){
                        if (err) throw err;
                        var query1 = LikePost.find({'user.uid':socket.uid, 'content_type':1}).select('content_id -_id');
                        query1.sort('-created').limit(30).exec(function(err1, likedocs){
                            if (err1) throw err1;

                            var query2 = SharePost.find({'user.uid':socket.uid, 'content_type':1}).select('content_id -_id');
                            query2.sort('-created').limit(30).exec(function(err2, sharedocs){
                                if (err2) throw err2;

                                var query3 = HatsoffPost.find({'user.uid':socket.uid, 'content_type':1}).select('content_id -_id');
                                query3.sort('-created').limit(30).exec(function(err3, hatsoffdocs){
                                    if (err3) throw err3;

                                    CommunityMember.findOne({uid:socket.uid}).exec(function(err, result){
                                        var friends = [];
                                        if(result){
                                          friends = result.friends;
                                        }
                                        socket.emit('update community post', {"sharedocs":sharedocs, "likedocs":likedocs, "hatsoffdocs":hatsoffdocs, "docs":docs, "friends":friends});
                                        redis_client.hmset(key, {
                                            'sharedocs': JSON.stringify(sharedocs),
                                            'likedocs': JSON.stringify(likedocs),
                                            'hatsoffdocs': JSON.stringify(hatsoffdocs),
                                            'docs': JSON.stringify(docs),
                                            'friends': JSON.stringify(friends),
                                            'last_update': new Date() 
                                        });
                                    });
                                });
                            });
                        });
                    }); 
                }
            });

            var pool = new pg.Pool(pgConfig);

            pool.connect(function(err, client, release) {
                var skills_query = `
                          SELECT 
                              week1_profile.skill1, week1_profile.skill2, week1_profile.skill3, week1_profile.skill4, week1_profile.skill5, 
                              week1_profile.skill6, week1_profile.skill7, week1_profile.skill8, week1_profile.skill9, week1_profile.skill10
                          FROM
                              week1_profile, week1_user
                          WHERE week1_user.uid='${socket.uid}' AND week1_user.id = week1_profile.user_id 
                `;
                client.query(skills_query, function(err, result){
                    release();
                    if (err) { return console.error('Error executing query', err.stack) }
                    var row = result.rows[0];
                    if (row) {
                        var skills_empty = [row.skill1, row.skill2, row.skill3, row.skill4, row.skill5, row.skill6, row.skill7, row.skill8, row.skill9, row.skill10];
                        var skills = [];
                        for (var i = 0; i < 10; i++){
                            if (skills_empty[i] == ""){
                                skills.push(skills_empty[0])
                            }else{
                                skills.push(skills_empty[i])
                            }
                        }

                        var tuplestr = "(?,?,?,?,?,?,?,?,?,?)";
                        var liststr = "('"+skills.join("','")+"')";
                        var collaborator_skill_query = `
                                SELECT DISTINCT 
                                    a.uid, a.first_name, a.last_name, p.profession1
                                FROM 
                                    week1_upcomingwork u, week1_user a, week1_profile p 
                                WHERE 
                                    u.user_id=a.id AND u.user_id=p.user_id AND a.uid!='${socket.uid}' AND
                                   (u.collaborator_skill1 in ${liststr} or u.collaborator_skill2 in ${liststr} or u.collaborator_skill3 in ${liststr} or 
                                    u.collaborator_skill4 in ${liststr} or u.collaborator_skill5 in ${liststr} or u.collaborator_skill6 in ${liststr} or 
                                    u.collaborator_skill7 in ${liststr} or u.collaborator_skill8 in ${liststr} or u.collaborator_skill9 in ${liststr} or 
                                    u.collaborator_skill10 in ${liststr})
                                LIMIT 3
                                `;

                        client.query(collaborator_skill_query, function(err, results){
                            release();
                            if (err) {
                                return console.error('Error executing query', err.stack)
                            }
                            socket.emit('three collaborators need you', results.rows);
                        });
                    }
                });

                var collaborator_skill_query = `
                    SELECT 
                        uw.collaborator_skill1, uw.collaborator_skill2, uw.collaborator_skill3, uw.collaborator_skill4, uw.collaborator_skill5, 
                        uw.collaborator_skill6, uw.collaborator_skill7, uw.collaborator_skill8, uw.collaborator_skill9, uw.collaborator_skill10
                    FROM
                        week1_upcomingwork uw, week1_user u 
                    WHERE u.id=uw.user_id AND u.uid='${socket.uid}'
                `;
                client.query(collaborator_skill_query, function(err, result){
                    var row = result.rows[0];
                    if (row){
                        var skills_empty = [row.collaborator_skill1, row.collaborator_skill2, row.collaborator_skill3, row.collaborator_skill4, row.collaborator_skill5, 
                                             row.collaborator_skill6, row.collaborator_skill7, row.collaborator_skill8, row.collaborator_skill9, row.collaborator_skill10];
                        var skills = [];
                        for (var i = 0; i < 10; i++){
                            if (skills_empty[i] == ""){
                              skills.push(skills_empty[0])
                            }else{
                              skills.push(skills_empty[i])
                            }
                        }
                        var tuplestr = "(?,?,?,?,?,?,?,?,?,?)";
                        var liststr = "('"+skills.join("','")+"')";
                        var profession_query = `
                            SELECT 
                                a.uid, a.first_name, a.last_name, p.profession1
                            FROM
                                week1_user a
                            JOIN 
                                week1_profile p
                            ON
                                a.uid!='${socket.uid}' AND p.user_id=a.id 
                            AND 
                                (p.skill1 in ${liststr} or p.skill2 in ${liststr} or p.skill3 in ${liststr} or p.skill4 in ${liststr} or p.skill5 in ${liststr} or p.skill6 in ${liststr} or p.skill7 in ${liststr} or p.skill8 in ${liststr} or p.skill9 in ${liststr} or p.skill10 in ${liststr} )
                            LIMIT 5
                            `;

                        client.query(profession_query, function(err, results){
                            release();
                            if (err) {
                                return console.error('Error executing query', err.stack)
                            }
                            socket.emit('three collaborators you need', results.rows);
                        });
                    }
                });

                var professions_query = `
                          SELECT 
                              week1_profile.profession1, week1_profile.profession2, week1_profile.profession3, week1_profile.profession4, week1_profile.profession5 
                          FROM
                              week1_profile, week1_user
                          WHERE week1_user.uid='${socket.uid}' AND week1_user.id = week1_profile.user_id 
                `;

                client.query(professions_query, function(err, result){
                    release();
                    if (err) {
                        return console.error('Error executing query', err.stack)
                    }
                    var row = result.rows[0];
                    if (row) {
                        var professions_empty = [row.profession1, row.profession2, row.profession3, row.profession4, row.profession5];
                        var professions = [];
                        for (var i = 0; i < 5; i++){
                            if (professions_empty[i] == ""){
                              professions.push(professions_empty[0])
                            }else{
                              professions.push(professions_empty[i])
                            }
                        }

                        var tuplestr = "(?,?,?,?,?)";
                        var liststr = "('"+professions.join("','")+"')";
                        var collaborator_profession_query = `
                                SELECT DISTINCT 
                                    a.uid, a.first_name, a.last_name, p.profession1
                                FROM 
                                    week1_upcomingwork u, week1_user a, week1_profile p 
                                WHERE 
                                    u.user_id=a.id AND u.user_id=p.user_id AND a.uid!='${socket.uid}' AND
                                   (u.collaborator1 in ${liststr} or u.collaborator2 in ${liststr} or u.collaborator3 in ${liststr} or 
                                    u.collaborator4 in ${liststr} or u.collaborator5 in ${liststr})
                                LIMIT 3
                                `;

                        client.query(collaborator_profession_query, function(err, results){
                            release();
                            if (err) {
                                return console.error('Error executing query', err.stack)
                            }
                            socket.emit('three collaborators with profession need you', results.rows);
                        });
                    }
                });

                var collaborator_profession_query = `
                    SELECT 
                        uw.collaborator1, uw.collaborator2, uw.collaborator3, uw.collaborator4, uw.collaborator5 
                    FROM
                        week1_upcomingwork uw, week1_user u 
                    WHERE u.id=uw.user_id AND u.uid='${socket.uid}'
                `;
                client.query(collaborator_profession_query, function(err, result){
                    var row = result.rows[0];
                    if (row){
                        var professions_empty = [row.collaborator1, row.collaborator2, row.collaborator3, row.collaborator4, row.collaborator5] 
                        var professions = [];
                        for (var i = 0; i < 5; i++){
                            if (professions_empty[i] == ""){
                                professions.push(professions_empty[0])
                            }else{
                                professions.push(professions_empty[i])
                            }
                        }
                        var tuplestr = "(?,?,?,?,?)";
                        var liststr = "('"+professions.join("','")+"')";
                        var profession_query = `
                                SELECT DISTINCT
                                    a.uid, a.first_name, a.last_name, p.profession1 
                                FROM week1_profile p, week1_user a 
                                WHERE a.uid!='${socket.uid}' AND p.user_id=a.id AND 
                                  (p.profession1 in ${liststr} or p.profession2 in ${liststr} or p.profession3 in ${liststr} or p.profession4 in ${liststr} or p.profession5 in ${liststr} )
                                LIMIT 3
                            `;

                        client.query(profession_query, function(err, results){
                            release();
                            if (err) {
                                return console.error('Error executing query', err.stack)
                            }
                            socket.emit('three collaborators with profession you need', results.rows);
                        });
                    }
                });

                client.release();
            });

            CommunityMember.findOne({uid:socket.uid}).exec(function(err, result){
                if(result){
                    var friends = result.friends;
                    var len = friends.length;
                    socket.emit('community members number', len);
                }
            });
        } catch(error){
            console.log("error at join community:", error);
        }
    });

    socket.on('leave community', function(uid){
        try{
            key = "community_"+uid;
            var query = communitypost.find({});
            query.sort('-created').limit(30).exec(function(err, docs){
                if (err) throw err;
                var query1 = likepost.find({'user.uid':socket.uid, 'content_type':1}).select('content_id -_id');
                query1.sort('-created').limit(30).exec(function(err1, likedocs){
                    if (err1) throw err1;

                    var query2 = sharepost.find({'user.uid':socket.uid, 'content_type':1}).select('content_id -_id');
                    query2.sort('-created').limit(30).exec(function(err2, sharedocs){
                        if (err2) throw err2;

                        var query3 = hatsoffpost.find({'user.uid':socket.uid, 'content_type':1}).select('content_id -_id');
                        query3.sort('-created').limit(30).exec(function(err3, hatsoffdocs){
                            if (err3) throw err3;

                            communitymember.findone({uid:socket.uid}).exec(function(err, result){
                                if(!result){
                                    var friends = [];
                                    client.hmset(key, {
                                        'sharedocs': json.stringify(sharedocs),
                                        'likedocs': json.stringify(likedocs),
                                        'hatsoffdocs': json.stringify(hatsoffdocs),
                                        'docs': json.stringify(docs),
                                        'friends': json.stringify(friends)
                                    });
                                }else{
                                    var friends = result.friends;
                                    client.hmset(key, {
                                        'sharedocs': json.stringify(sharedocs),
                                        'likedocs': json.stringify(likedocs),
                                        'hatsoffdocs': json.stringify(hatsoffdocs),
                                        'docs': json.stringify(docs),
                                        'friends': json.stringify(friends)
                                    });
                                }
                            });
                        });
                    });
                });
            }); 
        } catch(error){
            console.log("error at leave community:", error);
        }
    });

    socket.on('get community members number', function(){

        CommunityMember.findOne({uid:socket.uid}).exec(function(err, result){
            if(!result){
                console.log("no results");
            }else{
                var friends = result.friends;
                var len = friends.length;
                socket.emit('community members number', len);
            }
        });

    })

    socket.on('get suggested posts', function(){
    });

    socket.on('join community post', function(data){
        try {
            CommunityPost.findById(data.c_id, function(err, post){
                if (err) throw err;
                var query1 = LikePost.find({'user.uid':socket.uid, 'content_type':1, 'content_id':data.c_id}).select('user');
                query1.exec(function(err1, likedocs){
                    if (err1) throw err1;

                    var query2 = SharePost.find({'user.uid':socket.uid, 'content_type':1, 'content_id':data.c_id}).select('user');
                    query2.exec(function(err2, sharedocs){
                        if (err2) throw err2;

                        var query3 = HatsoffPost.find({'user.uid':socket.uid, 'content_type':1, 'content_id':data.c_id}).select('user');
                        query3.exec(function(err3, hatsoffdocs){
                            if (err3) throw err3;

                            socket.emit('get community post', {sharedocs:sharedocs, likedocs:likedocs, hatsoffdocs:hatsoffdocs, post:post});
                        });
                    });
                });
            }); 
        } catch(error){
            console.log("error at join community post:", error)
        }
    });

    socket.on('at community needs you', function(data){
    });

    socket.on('at collaborators you need', function(data){
    });

    socket.on('at collaborators need you', function(data){
    });

    socket.on('at talent list', function(data){
    });


    socket.on('at chat message', function(data){
        try {
            MessageRelation.find().or([{ uid1:socket.uid, action_user:2, status:1 }, {uid2:socket.uid, action_user:1, status:1}]).sort('-created').exec(function(err, result){
                if (err) {
                    console.log(err);
                }else {
                    if (result){
                        socket.emit('update first message', result);
                    }
                }
            });

            MessageRelation.find().or([{ uid1:socket.uid, status:2 }, {uid2:socket.uid, status:2}]).sort('-created').exec(function(err, result){
                if (err) {
                    console.log(err);
                }else {
                    if (result){
                        socket.emit('update chat message', result);
                        for (var i = 0; i < result.length; i++){
                            socket.join(result[i]._id);
                        }
                    }
                }
            });
        }catch(error){
            console.log("error at talent list:", error)
        }
    });

    socket.on('at history', function(data){
        var query = CommunityPost.find({'user.uid':socket.uid});
        query.sort('-created').limit(30).exec(function(err, communitydocs){
            if (err) throw err;
            //console.log('community history'+communitydocs);
            socket.emit('update community post history', communitydocs);
        }); 

        var query1 = LikePost.find({'user.uid':socket.uid});
        query1.sort('-created').limit(30).exec(function(err, likedocs){
            if (err) throw err;
            socket.emit('update like history', likedocs);
        }); 

        var query2 = SharePost.find({'user.uid':socket.uid});
        query2.sort('-created').limit(30).exec(function(err, sharedocs){
            if (err) throw err;
            socket.emit('update share history', sharedocs);
        }); 

        var query3 = ShareSkillPost.find({'user.uid':socket.uid});
        query3.sort('-created').limit(30).exec(function(err, skilldocs){
            if (err) throw err;
            socket.emit('update shareskill history', skilldocs);
        }); 

          //socket.emit('update community post history', docs);
        var query1 = CommentPost.find({'from_user.uid':socket.uid});
        query.sort('-created').limit(30).exec(function(err, commentdocs){
            if (err) throw err;
            //socket.emit('update comment history', docs);
        }); 


        var query2 = UpcomingPost.find({'user.uid':socket.uid});
        var upcomingdocs;
        query2.sort('-created').limit(30).exec(function(err, docs){
            if (err) throw err;
            //console.log('upcoming comment at history'+docs);
            upcomingdocs = docs;
            //socket.emit('update upcoming comment history', docs);
        }); 

        var query3 = PortfolioPost.find({'user.uid':socket.uid});
        var portfoliodocs;
        query3.sort('-created').limit(30).exec(function(err, docs){
            if (err) throw err;
            //console.log('portfolio comment at history'+docs);
            portfoliodocs = docs;
            //socket.emit('update portfolio comment history', docs);
        }); 
    });

    socket.on('at home', function(data){
        try{
            var query = CommentPost.find({'to_uid':data.uid});
            query.sort('-created').limit(30).exec(function(err, docs){
                if (err) throw err;
                socket.emit('update comment', docs);
            }); 

            var query2 = UpcomingPost.find({'to_uid':data.uid});
            query2.sort('-created').limit(30).exec(function(err, docs){
                if (err) throw err;
                socket.emit('update upcoming comment', docs);
            }); 

            var query3 = PortfolioPost.find({'to_uid':data.uid});
            query3.sort('-created').limit(30).exec(function(err, docs){
                if (err) throw err;
                socket.emit('update portfolio comment', docs);
            }); 

            HatsoffPost.find({'to_uid':data.uid}).count(function(err, count){
                if (err) throw err;
                socket.emit('number hatsoff', count);
                HatsoffPost.find({'user.uid':data.uid, 'to_uid':data.uid}).exec(function(error, docs){
                    if(error) throw error;
                    socket.emit('hatsoff status at home', {docs:docs, count:count});
                }); 
            }); 

            FollowPost.find().or([{uid1:socket.uid, action_user:2, status:1}, {uid1:data.uid, status:2}, {uid2:data.uid, action_user:1, status:1}, {uid2:data.uid, status:2}]).count(function(err, count){
                if (err) throw err;
                socket.emit('number follow', count);
            }); 


            LikePost.find({'to_uid':data.uid}).exec(function(error, result){
                if(error) throw error;

                if(result){
                    socket.emit('likes at home', result);
                }
            });

            SharePost.find({'to_uid':data.uid}).exec(function(error, result){
                if(error) throw error;

                if(result){
                    socket.emit('shares at home', result);
                }
            });

            // content_type 1:community post 2:upcoming work 3:portfolio 4:shared post
            var query_cp = CommunityPost.find({'user.uid':data.uid});
            async.waterfall([
                function(callback){
                    var query_cp = CommunityPost.find({'user.uid':data.uid});
                    query_cp.sort('-created').limit(30).exec(function(err, communitydocs){
                        callback(null, communitydocs);
                    });
                },
                function(communitydocs, callback){
                    var query_sh = SharePost.find({'user.uid':data.uid});
                    query_sh.sort('-created').limit(30).exec(function(err, sharedocs){
                        callback(null, communitydocs, sharedocs);
                    });
                },
                function(communitydocs, sharedocs){ 
                    var newdocs = [];
                    var curIdx = 0;
                    var len = sharedocs.length;
                    if (len == 0){
                        socket.emit('update timeline history', {share:newdocs, community:communitydocs});
                    }else{
                        async.each(sharedocs, function(docs){
                            if (docs.content_type == 1){
                                async.waterfall([
                                    function(callback){
                                        CommunityPost.findOne({'_id':docs.content_id}).exec(function(err, post){
                                            callback(null, post);
                                        });
                                    },
                                    function(post){
                                        docs.set('content', post.toJSON(), {strict: false});
                                        newdocs.push(docs);
                                        curIdx += 1;
                                        if (curIdx == len){
                                            socket.emit('update timeline history', {share:newdocs, community:communitydocs});
                                        }
                                     }
                                ], function(err, result){});

                            } else if(docs.content_type == 2){
                                curIdx += 1;
                                if (curIdx == len){
                                    socket.emit('update timeline history', {share:newdocs, community:communitydocs});
                                }
                            } else if(docs.content_type == 3){
                                curIdx += 1;
                                if (curIdx == len){
                                    socket.emit('update timeline history', {share:newdocs, community:communitydocs});
                                }
                            } else if(docs.content_type == 4){
                                curIdx += 1;
                                if (curIdx == len){
                                    socket.emit('update timeline history', {share:newdocs, community:communitydocs});
                                }
                            } else{
                                curIdx += 1;
                                if (curIdx == len){
                                    socket.emit('update timeline history', {share:newdocs, community:communitydocs});
                                }
                            }
                        });
                    }
                },
              ], 
            function(err, result){
                console.log("err:"+err);
            }); 
        } catch(error){
            console.log("error at home:", error);
        }
    });
 
    socket.on('at userpage', function(data){
        try{
            var query = CommentPost.find({'to_uid':data.to_uid});
            query.sort('-created').limit(30).exec(function(err, docs){
                if (err) throw err;
                socket.emit('update comment', docs);
            }); 

            var query2 = UpcomingPost.find({'to_uid':data.to_uid});
            query2.sort('-created').limit(30).exec(function(err, docs){
                if (err) throw err;
                socket.emit('update upcoming comment', docs);
            }); 

            var query3 = PortfolioPost.find({'to_uid':data.to_uid});
            query3.sort('-created').limit(30).exec(function(err, docs){
                if (err) throw err;
                socket.emit('update portfolio comment', docs);
            }); 

            FollowPost.find().or([{uid1:data.to_uid, action_user:2, status:1}, {uid1:data.to_uid, status:2}, {uid2:data.to_uid, action_user:1, status:1}, {uid2:data.to_uid, status:2}]).count(function(err, count){
                if (err) throw err;
                socket.emit('number user follow', count);
            }); 

            var uid1, uid2, action_user;
            if (data.uid < data.to_uid){
                uid1 = data.uid;
                uid2 = data.to_uid; 
                action_user = 1;
            }else{
                uid2 = data.uid;
                uid1 = data.to_uid; 
                action_user = 2;
            }

            MessageRelation.findOne({ uid1:uid1, uid2:uid2 }).exec(function(err, result){
                if (err) {
                    console.log(err);
                }else {
                    if (result){
                        //socket.join(result._id);
                        socket.emit('set message', result);
                    }else{
                        //Default status is 2
                        var newMessageRelation = new MessageRelation({uid1:uid1, uid2:uid2, action_user:action_user, status:2 });
                        newMessageRelation.save(function(error, newdata){
                            if (error) {
                                console.log(error);
                            }else{
                                /** emmit new message to data.to_uid message.html **/
                                //socket.join(newdata._id);
                                socket.emit('set message', newdata) 
                            }
                        });
                    }
                }
            });

            LikePost.find({'to_uid':data.to_uid, 'user.uid':data.uid}).exec(function(error, result){
                if(error) throw error;

                if(result){
                    socket.emit('like status', result);
                }
            }); 

            // Follow status 0:not following, 1:following
            //1: sent request, 2:accepted, 3:blocked
            FollowPost.find().or([{uid1:data.to_uid, action_user:2, status:1}, {uid1:data.to_uid, status:2}, {uid2:data.to_uid, action_user:1, status:1}, {uid2:data.to_uid, status:2}]).count(function(error, count){
                if(error) throw error;
                   
                FollowPost.findOne({uid1:uid1, uid2:uid2}).exec(function(err, result){
                    if(err){

                    }else{
                        if(result){
                            if( result.status == 2){
                                socket.emit('follow status', {status:2, count:count});
                            }else if ((result.uid1==socket.uid && result.action_user==1) || (result.uid2==data.uid && result.action_user==2)){
                                socket.emit('follow status', {status:1, count:count});
                            }else{
                                //Got request
                                socket.emit('follow status', {status:11, count:count});
                            }
                        }else{
                            socket.emit('follow status', {status:0, count:count});
                        }
                    }
                });
            });

            HatsoffPost.find({'to_uid':data.to_uid}).count(function(err, count){
                if (err) throw err;
                HatsoffPost.find({'user.uid':data.uid, 'to_uid':data.to_uid}).exec(function(error, docs){
                    if(error) throw error;
                    socket.emit('hatsoff status', {docs:docs, count:count});
                }); 
            });

            var query_cp = CommunityPost.find({'user.uid':data.to_uid});
            async.waterfall([
                function(callback){
                    var query_cp = CommunityPost.find({'user.uid':data.to_uid});
                    query_cp.sort('-created').limit(30).exec(function(err, communitydocs){
                        callback(null, communitydocs);
                    });
                },
                function(communitydocs, callback){
                    var query_sh = SharePost.find({'user.uid':data.to_uid});
                    query_sh.sort('-created').limit(30).exec(function(err, sharedocs){
                        callback(null, communitydocs, sharedocs);
                    });
                },
                function(communitydocs, sharedocs){ 
                    var newdocs = [];
                    var curIdx = 0;
                    var len = sharedocs.length;
                    if (len == 0){
                        socket.emit('update user timeline history', {share:newdocs, community:communitydocs});
                    }else{
                        async.each(sharedocs, function(docs){
                            if (docs.content_type == 1){
                                async.waterfall([
                                    function(callback){
                                        CommunityPost.findOne({'_id':docs.content_id}).exec(function(err, post){
                                            callback(null, post);
                                        });
                                    },
                                    function(post){
                                        docs.set('content', post.toJSON(), {strict: false});
                                        newdocs.push(docs);
                                        //console.log("****newdocs****:"+newdocs);
                                        curIdx += 1;
                                        if (curIdx == len){
                                            socket.emit('update user timeline history', {share:newdocs, community:communitydocs});
                                        }
                                   }
                                ], function(err, result){});

                            } else if(docs.content_type == 2){
                                curIdx += 1;
                                if (curIdx == len){
                                    socket.emit('update user timeline history', {share:newdocs, community:communitydocs});
                                }
                            } else if(docs.content_type == 3){
                                curIdx += 1;
                                if (curIdx == len){
                                    socket.emit('update user timeline history', {share:newdocs, community:communitydocs});
                                }
                            } else if(docs.content_type == 4){
                                curIdx += 1;
                                if (curIdx == len){
                                    socket.emit('update user timeline history', {share:newdocs, community:communitydocs});
                                }
                            } else{
                                curIdx += 1;
                                if (curIdx == len){
                                    socket.emit('update user timeline history', {share:newdocs, community:communitydocs});
                                }
                            }
                      });
                   }
                },
            ], function(err, result){
                console.log("err:"+err);
            }); 
        }catch(error){
            console.log("erorr at userpage:", error)
        } 
    });

    socket.on('at notification', function(){
        var newdocs = [];
        var query = NotificationPost.find({'to_uid':socket.uid});
        query.sort('-created').limit(30).exec(function(err, docs){
            if (err) throw err;
            //socket.emit('update notification', docs);
            var len = docs.length;
            var curIdx = 0;
            async.each(docs, function(doc){
                var uid = doc.action_user.uid;
                async.waterfall([
                    function(callback){
                        //CommunityMember.findOne({ uid : uid }).lean().exec(function(err, post){
                        CommunityMember.findOne({ uid : uid }, function(err, post){
                            callback(null, post);
                        });
                    },
                    function(post, callback){
                        //CommunityMember.findOne({ uid : uid }).lean().exec(function(err, post){
                        var uid1, uid2, action_user;
                        if (socket.uid < uid){
                            uid1 = socket.uid;
                            uid2 = uid; 
                            action_user = 1;
                        }else{
                            uid2 = socket.uid;
                            uid1 = uid; 
                            action_user = 2;
                        }

                        FollowPost.findOne({uid1:uid1, uid2:uid2}).exec(function(err, result){
                            var fstatus = 0;
                            if (result){
                                if(result.status == 2){
                                    fstatus = 2;
                                }else if (result.status == 1 && uid1 == socket.uid && result.action_user == 1){
                                    fstatus = 1;
                                }else if (result.status == 1 && uid2 == socket.uid && result.action_user == 2){
                                    fstatus = 1;
                                }else{
                                    fstatus = 11;
                                }
                           }
                           callback(null, post, fstatus);
                        });
                    },
                    function(post, fstatus){
                        if (post != null){
                            var friend = JSON.stringify(post);
                            var obj = JSON.parse(friend);
                            var f = obj["friends"];
                            doc.set('friends', f, {strict: false});
                            doc.set('fstatus', fstatus, {strict: false});
                            newdocs.push(doc);
                        }else{
                            doc.set('fstatus', fstatus, {strict: false});
                            newdocs.push(doc);
                        }
                        //console.log("****newdocs****:"+newdocs);
                        curIdx += 1;
                        if (curIdx == len){
                            CommunityMember.findOne({ uid : socket.uid }, function(err, mycm){
                                socket.emit('update notification', {newdocs:newdocs, myMember:mycm});
                            });
                        }
                    }
                ], function(err, result){
              });
            });
        }); 
    });

    function updateUids(){
        io.emit('usernames', Object.keys(users));
    }
    
    function updatechatUids(){
        io.emit('chatusers', Object.keys(chatusers));
        console.log(Object.keys(chatusers));
    }

    socket.on('chat message', function(data, callback){
        var msg = data.trim();
        if (msg.substr(0,3) === '/w '){
            msg = msg.substr(3);
            var ind = msg.indexOf(' ');
            if (ind !== -1){
                var name = msg.substring(0, ind);
                var msg = msg.substring(ind+1);
                if (name in users){
                    users[name].emit('whisper', {msg:msg, nick:socket.uid});
                }else{
                    callback('Erorr! Enter valid user');
                }
            }else{
                callback('Error! Please enter a meesage for your whisper.');
            }
        }else{
            io.emit('new message', {msg:msg, nick:socket.uid});
        }
    });

    socket.on('community post', function(data, callback){
        try {
            var d = new Date();
            var ls = [];
            if(data.skillls.length != 0){
                for (var i = 0; i < data.skillls.length; i++) {
                    var item = data.skillls[i];  // Calling myNodeList.item(i) isn't necessary in JavaScript
                    ls.push(item);
                }
                if (data.skillls.length < 5){
                    for (var i = data.skillls.length; i <= 5; i++){
                        ls.push(data.skillls[0]);
                    }
                }
            }

            var newPost;
            if (data.data){
                newPost = new CommunityPost({content:data.msg, user:{uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname}, tag:data.tag, skillls:data.skillls, communityFlag:0, image: {data: true, contentType: data.data['type']}, shares:0, likes:0});
            }else{
                newPost = new CommunityPost({content:data.msg, user:{uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname}, tag:data.tag, skillls:data.skillls, communityFlag:0, shares:0, likes:0});
            }
            newPost.save(function(err, post){
                if (err) {
                    console.log(err);
                    return;
                } else{
                    var image = { data: false }

                    if (data.data){
                        s3.putObject({
                            Bucket: 'matchhat-community-posts',
                            Key: post.id + '.png',
                            Body: data.data['file'],
                            ACL: 'public-read'
                        }, function (resp) {
                            console.log('Successfully uploaded package.');
                        });
                        image = { data: true, contentType: data.data['type'] }
                    }
                    io.emit('new community post', {msg:data.msg, image:image, uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname, community_id:post.id, tag:data.tag, skillls:data.skillls});
                }
            });
        }catch(error){
            console.log("error at community post:", error);
        }
    });

    socket.on('private post', function(data, callback){
        try {
            var ls = [];
            if(data.skillls.length != 0){
                for (var i = 0; i < data.skillls.length; i++) {
                    var item = data.skillls[i];  // Calling myNodeList.item(i) isn't necessary in JavaScript
                    ls.push(item);
                }
                if (data.skillls.length < 5){
                    for (var i = data.skillls.length; i <= 5; i++){
                        ls.push(data.skillls[0]);
                    }
                }
            }

            var newPost;    
            if (data.data){
                newPost = new CommunityPost({content:data.msg, user:{uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname}, tag:data.tag, skillls:data.skillls, communityFlag:1, image:{data: true, contentType: data.data['type']}, shares:0, likes:0});
            }else{
                newPost = new CommunityPost({content:data.msg, user:{uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname}, tag:data.tag, skillls:data.skillls, communityFlag:1, shares:0, likes:0});
            }
            newPost.save(function(err, post){
                if (err) {
                    console.log(err);
                } else{
                    var image = { data: false }

                    if (data.data){
                        s3.putObject({
                            Bucket: 'matchhat-community-posts',
                            Key: post.id + '.png',
                            Body: data.data['file'],
                            ACL: 'public-read'
                        }, function (resp) {
                            console.log('Successfully uploaded package.');
                        });
                        image = { data: true, contentType: data.data['type'] }
                    }

                    CommunityMember.findOne({uid:socket.uid}).exec(function(err, result){
                        if(!result){
                            socket.emit('new private post', {msg:data.msg, image:image, uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname, community_id:post.id, tag:data.tag, skillls:data.skillls});
                        }else{
                            var friends = result.friends;
                            socket.emit('new private post', {msg:data.msg, image:image, uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname, community_id:post.id, tag:data.tag, skillls:data.skillls});
                            for (var i = 0; i < friends.length; i++){
                                if (friends[i] in users){
                                    users[friends[i]].emit('new private post', {msg:data.msg, image:image, uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname, community_id:post.id, tag:data.tag, skillls:data.skillls});
                                }
                            }
                        }
                    });
                }
            });
        }catch(error){
            console.log("error at private post:", error)
        }
    });

    socket.on('community comment', function(data, callback){
        var d = new Date();
        
        try{
            CommunityPost.findById(data.c_id, function(err, post){
                if (err) {
                    console.log(err);
                } else{
                    post.replys.push({user:{uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname}, content:data.msg});
                    post.save(function (err) {
                        if (!err) {
                            io.emit('new community comment', {msg:data.msg, community_id:data.c_id, uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname});
                        }
                    });
                }
            });
        } catch(error){
            console.log("error at community comment:", error)
        } 
    });


    socket.on('give collaborate', function(data, callback){
        var d = new Date();
      
        try{
            var newPost = new CollaboratePost({to_uid:data.to_uid, user:{uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname}, content_id:data.c_id, content_type:data.c_type});
            newPost.save(function(err){
                if (err) {
                    console.log(err);
                }
            });

            var newNotification = new NotificationPost({action_id:7, to_uid:data.to, action_user:{uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname}, content_id:data.c_id, content_type:data.c_type});

            newNotification.save(function(err){
                if (err) {
                    console.log(err);
                }
            }); 
        } catch(error){
            console.log("error at give collaborate:", error)
        } 
    });

    socket.on('give hatsoff', function(data, callback){
        var d = new Date();

        try{
            HatsoffPost.findOne({to_uid:data.to_uid, user:{uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname}, content_type:data.content_type, content_id:data.content_id}).exec(function(err, result){
                if(err){
                    console.log(err);
                }else{
                    if (!result){
                        var newPost = new HatsoffPost({to_uid:data.to_uid, user:{uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname}, content_type:data.content_type, content_id:data.content_id});
                        newPost.save(function(err){
                            if (err) {
                                console.log(err);
                            } else{
                                socket.emit('new history', {to_uid:data.to_uid, content_type:data.content_type, content_id:data.content_id, action_id:2});
                                socket.emit('new hatsoff userpage');
                                if (data.to_uid in users){
                                    users[data.to_uid].emit('new notification', {action_id:2, from_uid:socket.uid, from_first_name:socket.firstname, from_lastname:socket.lastname});
                                }
                            }
                        });
                    } 
                }
            });

            var newNotification = new NotificationPost({action_id:2, to_uid:data.to_uid, action_user:{uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname}});

            newNotification.save(function(err){
              if (err) {
                console.log(err);
              }
            });
        } catch(error){
            console.log("error at give hatsoff:", error)
        } 
    });

    socket.on('give unhatsoff', function(data, callback){
        try {
            HatsoffPost.find({'to_uid':data.to_uid, 'user.uid':socket.uid, 'content_type':data.content_type, 'content_id':data.content_id}).remove().exec();
        } catch(error){
            console.log("error at give unhatsoff:", error)
        } 
    });

    socket.on('give follow', function(data, callback){
        try {
            var d = new Date();

            var uid1, uid2, action_user;
            if (socket.uid < data.to_uid){
                uid1 = socket.uid;
                uid2 = data.to_uid; 
                action_user = 1;
            }else{
                uid2 = socket.uid;
                uid1 = data.to_uid; 
                action_user = 2;
            }

            FollowPost.findOne({uid1:uid1, uid2:uid2}).exec(function(err, result){
                if(err){
                }else{

                    if(!result){
                        var newPost = new FollowPost({uid1:uid1, uid2:uid2, action_user:action_user, status:1});

                        newPost.save(function(err){
                            if (err) {
                                console.log(err);
                            } else{
                                socket.emit('new history', {to_uid:data.to_uid, content_type:1, action_id:8});
                                if (data.to_uid in users){
                                    users[data.to_uid].emit('new notification', {action_id:8, from_uid:socket.uid, from_first_name:socket.firstname, from_lastname:socket.lastname});
                                }
                            }
                        }); 
                    }else{
                        if (result.action_user != action_user && result.status != 2){
                            result.status = 2;
                            result.save();
                            socket.emit('new community member');
                            CommunityMember.findOne({uid:uid1}).exec(function(err, result){
                                if (result){
                                    result.friends.push(uid2);
                                    result.save(function (er) {
                                        console.log("friends saved");
                                    });
                                }else{
                                    var cm = new CommunityMember({uid:uid1, friends:[uid2]})
                                    cm.save(function(e){
                                        console.log("new friends saved");
                                    })
                                }
                            });

                            CommunityMember.findOne({uid:uid2}).exec(function(err, result){
                                if(result){
                                    result.friends.push(uid1);
                                    result.save(function (err) {
                                        console.log("friends saved");
                                    });
                                }else{
                                    var cm = new CommunityMember({uid:uid2, friends:[uid1]})
                                    cm.save(function(e){
                                        console.log("new friends saved");
                                    })
                                }
                            });
                        }
                    }
                }
            });

            var newNotification = new NotificationPost({action_id:8, to_uid:data.to_uid, action_user:{uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname}});

            newNotification.save(function(err){
                if (err) {
                    console.log(err);
                }
            });
        } catch(error){
            console.log("error at give follow:", error)
        } 
    });

    socket.on('get community likeusers', function(data){
        LikePost.find({'content_type':1, content_id:data.c_id}).exec(function(err, docs){
            socket.emit('list community likeusers', {c_id:data.c_id, result:docs});
        });
    });

    socket.on('get community shareusers', function(data){
        SharePost.find({'content_type':1, content_id:data.c_id}).exec(function(err, docs){
            socket.emit('list community shareusers', {c_id:data.c_id, result:docs});
        });
    });

    socket.on('get upcoming likeusers', function(data){
        LikePost.find({'content_type':2, to_uid:data.uid}).exec(function(err, docs){
            socket.emit('list upcoming likeusers', {uid:data.uid, result:docs});
        });
    });

    socket.on('get portfolio likeusers', function(data){
        LikePost.find({'content_type':3, 'content_id':data.p_id, to_uid:data.uid}).exec(function(err, docs){
            socket.emit('list portfolio likeusers', {uid:data.uid, result:docs, p_id:data.p_id});
        });
    });

    socket.on('get upcoming shareusers', function(data){
        SharePost.find({'content_type':2, to_uid:data.uid}).exec(function(err, docs){
            socket.emit('list upcoming shareusers', {uid:data.uid, result:docs});
        });
    });

    socket.on('get portfolio shareusers', function(data){
        SharePost.find({'content_type':3, 'content_id':data.p_id, to_uid:data.uid}).exec(function(err, docs){
            socket.emit('list portfolio shareusers', {uid:data.uid, result:docs, p_id:data.p_id});
        });
    });

    socket.on('unshare community', function(data, callback){
        try {
            SharePost.find({'to_uid':data.to_uid, 'user.uid':socket.uid, 'content_type':1}).remove().exec();
            CommunityPost.findById(data.c_id, function(err, doc){
                if (err) console.log(err);

                if (doc.likes > 0){
                    doc.shares -= 1;
                    doc.save(callback);
                }
            });
        } catch(error){
            console.log("Error at unshare community:", error); 
        }
    });

    socket.on('share community', function(data, callback){
        try {
            var d = new Date();
            
            var newPost = new SharePost({to_uid:data.to_uid, user:{uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname}, content_type:1, content_id:data.c_id});
            newPost.save(function(err){
                if (err) {
                    console.log(err);
                } else{
                    socket.emit('new history', {to_uid:data.to_uid, content_type:1, content_id:data.c_id, action_id:5});
                    if (data.to_uid in users){
                        users[data.to_uid].emit('new notification', {action_id:5, from_uid:socket.uid, from_first_name:socket.firstname, from_lastname:socket.lastname});
                    }
                }
            });

            CommunityPost.findById(data.c_id, function(err, doc){
                if (err) console.log(err);

                doc.shares += 1;
                doc.save(callback);
            });

            var newNotification = new NotificationPost({action_id:5, to_uid:data.to_uid, action_user:{uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname}});

            newNotification.save(function(err){
                if (err) {
                    console.log(err);
                }
            });
        } catch(error){
            console.log("Error at share community:", error); 
        }
    });

    socket.on('unlike community', function(data, callback){
        try{
            LikePost.find({'to_uid':data.to_uid, 'user.uid':socket.uid, 'content_type':1}).remove().exec();
            CommunityPost.findById(data.c_id, function(err, doc){
                if (err) console.log(err);

                if (doc.likes > 0){
                    doc.likes -= 1;
                    doc.save(callback);
                }
            });
        } catch(error){
            console.log("Error at unlike community:", error); 
        }
    });

    socket.on('like community', function(data, callback){
        try {
            var d = new Date();
            
            var newPost = new LikePost({to_uid:data.to_uid, user:{uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname}, content_type:1, content_id:data.c_id});
            newPost.save(function(err){
                if (err) {
                    console.log(err);
                } else{
                    socket.emit('new history', {to_uid:data.to_uid, content_type:1, content_id:data.c_id, action_id:4});
                    if (data.to_uid in users){
                        users[data.to_uid].emit('new notification', {action_id:4, from_uid:socket.uid, from_first_name:socket.firstname, from_lastname:socket.lastname});
                    }
                }
            });

            CommunityPost.findById(data.c_id, function(err, doc){
                if (err) console.log(err);

                doc.likes += 1;
                doc.save(callback);
            });


            var newNotification = new NotificationPost({action_id:4, to_uid:data.to_uid, action_user:{uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname}});

            newNotification.save(function(err){
                if (err) {
                  console.log(err);
                }
            });
        } catch(error){
            console.log("Error at like community:", error); 
        }
    });

    socket.on('like upcoming', function(data, callback){
        try{
            var d = new Date();
            
            var newPost = new LikePost({to_uid:data.to_uid, user:{uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname}, content_type:2, content_id:data.c_id});
            newPost.save(function(err){
                if (err) {
                    console.log(err);
                } else{
                    socket.emit('new history', {to_uid:data.to_uid, content_type:2, content_id:data.c_id, action_id:4});
                    if (data.to_uid in users){
                        users[data.to_uid].emit('new notification', {action_id:4, content_type:2, from_uid:socket.uid, from_first_name:socket.firstname, from_lastname:socket.lastname});
                    }
                }
            });

            var newNotification = new NotificationPost({action_id:4, content_type:2, content_id:data.c_id, to_uid:data.to_uid, action_user:{uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname}});

            newNotification.save(function(err){
                if (err) {
                  console.log(err);
                }
            });
        } catch(error){
            console.log("Error at like upcoming:", error); 
        }
    });

    socket.on('unlike upcoming', function(data, callback){
        try{
            LikePost.find({'to_uid':data.to_uid, 'user.uid':socket.uid, 'content_type':2}).remove().exec();
        } catch(error){
            console.log("Error at unlike upcoming:", error); 
        }
    });

    socket.on('unlike portfolio', function(data, callback){
        try{
            LikePost.find({'to_uid':data.to_uid, 'user.uid':socket.uid, 'content_type':3, 'content_id':data.c_id}).remove().exec();
        } catch(error){
            console.log("Error at unlike portfolio:", error); 
        }
    });

    socket.on('like portfolio', function(data, callback){
        try{
            var d = new Date();
            
            var newPost = new LikePost({to_uid:data.to_uid, user:{uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname}, content_type:3, content_id:data.c_id});
            newPost.save(function(err){
                if (err) {
                    console.log(err);
                } else{
                    socket.emit('new history', {to_uid:data.to_uid, content_type:2, content_id:data.c_id, action_id:4});
                    if (data.to_uid in users){
                        users[data.to_uid].emit('new notification', {action_id:4, content_type:3, from_uid:socket.uid, from_first_name:socket.firstname, from_lastname:socket.lastname});
                    }
                }
            });

            var newNotification = new NotificationPost({action_id:4, content_type:3, content_id:data.c_id, to_uid:data.to_uid, action_user:{uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname}});

            newNotification.save(function(err){
                if (err) {
                    console.log(err);
                } else{
                    console.log('saved notification:');
                }
            });
        } catch(error){
            console.log("Error at like portfolio:", error); 
        }
    });

    socket.on('unshare upcoming', function(data, callback){
        try{
            SharePost.find({'to_uid':data.to_uid, 'user.uid':socket.uid, 'content_type':2}).remove().exec();
        } catch(error){
            console.log("Error at unshare upcoming:", error); 
        }
    });

    socket.on('unshare portfolio', function(data, callback){
        try{
            SharePost.find({'to_uid':data.to_uid, 'user.uid':socket.uid, 'content_type':3, 'content_id':data.c_id}).remove().exec();
        } catch(error){
            console.log("Error at unshare portfolio:", error); 
        }
    });

    socket.on('share post', function(data, callback){
        try{
            var d = new Date();
            
            var newPost = new SharePost({to_uid:data.to_uid, user:{uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname}, content_type:1, content_id:data.c_id});
            newPost.save(function(err){
                if (err) {
                    console.log(err);
                } else{
                    socket.emit('new history', {to_uid:data.to_uid, content_type:1, content_id:data.c_id, action_id:5});
                    if (data.to_uid in users){
                        users[data.to_uid].emit('new notification', {action_id:5, from_uid:socket.uid, from_first_name:socket.firstname, from_lastname:socket.lastname});
                       //users[data.to].emit('new notification', {action_id:1, from_uid:socket.uid, from_firstname:socket.firstname, from_lastname:socket.lastname});
                    }
                }
            });

            var newNotification = new NotificationPost({action_id:5, to_uid:data.to_uid, action_user:{uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname}});

            newNotification.save(function(err){
                if (err) {
                    console.log(err);
                }
            });

            CommunityPost.findById(data.c_id, function(err, post){
                if (err) {
                    console.log(err);
                } else{
                    post.shares += 1;
                    post.save();

                    var newPost = new CommunityPost({content:post.content, user:{uid:post.user.uid, first_name:post.user.first_name, last_name:post.user.last_name}, tag:post.tag, skillls:post.skillls, sharedBy:socket.uid, content_id:data.c_id});
                    newPost.save(function(error, newpost){
                        if (error) {
                            console.log(error);
                        }
                    });
                }
            });
        } catch(error){
            console.log("Error at share post:", error); 
        }
    });

    socket.on('share upcoming', function(data, callback){
        try {
            var d = new Date();
            
            var newPost = new SharePost({to_uid:data.to_uid, user:{uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname}, content_type:2, content_id:data.c_id});
            newPost.save();

            newPost.save(function(err){
                if (err) {
                    console.log(err);
                } else{
                    socket.emit('new history', {to_uid:data.to_uid, content_type:2, content_id:data.c_id, action_id:5});
                    if (data.to_uid in users){
                        users[data.to_uid].emit('new notification', {action_id:5, from_uid:socket.uid, from_first_name:socket.firstname, from_lastname:socket.lastname});
                       //users[data.to].emit('new notification', {action_id:1, from_uid:socket.uid, from_firstname:socket.firstname, from_lastname:socket.lastname});
                    }
                }
            });

            var newNotification = new NotificationPost({action_id:5, content_type:2, content_id:data.c_id, to_uid:data.to_uid, action_user:{uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname}});

            newNotification.save(function(err){
                if (err) {
                    console.log(err);
                } else{
                    console.log('saved notification:');
                }
            });
        } catch(error){
            console.log("Error at share upcoming:", error); 
        }
    });

    socket.on('share portfolio', function(data, callback){
        try{
            var d = new Date();
            //var newPost = new SharePost({to_uid:data.to_uid, user:{uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname}, content_type:3, content_id:data.c_id});

            var newPost = new SharePost({to_uid:data.to_uid, user:{uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname}, content_type:3, content_id:data.c_id});
            newPost.save();

            var newNotification = new NotificationPost({action_id:5, content_type:3, content_id:data.c_id, to_uid:data.to_uid, action_user:{uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname}});

            newNotification.save(function(err){
                if (err) {
                    console.log(err);
                } else{
                    console.log('saved notification:');
                }
            });
        } catch(error){
            console.log("Error at share portfolio:", error); 
        }

    });


    socket.on('post comment', function(data, callback){
        try{
            var newComment = new CommentPost({content:data.msg, to_uid:data.to, from_user:{uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname}});

            newComment.save(function(err){
                if (err) {
                    console.log(err);
                } else{
                    socket.emit('new comment', {msg:data.msg, from:socket.uid, from_firstname:socket.firstname, from_lastname:socket.lastname});

                    if (data.to in users && data.to != socket.uid){
                        users[data.to].emit('new comment', {msg:data.msg, from_uid:socket.uid, from_firstname:socket.firstname, from_lastname:socket.lastname});
                    }
                }
            });

            var newNotification = new NotificationPost({action_id:1, to_uid:data.to, action_user:{uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname}});

            newNotification.save(function(err){
                if (err) {
                    console.log(err);
                } else{
                    if (data.to in users){
                       users[data.to].emit('new notification', {action_id:1, from_uid:socket.uid, from_firstname:socket.firstname, from_lastname:socket.lastname});
                    }
                }
            });
        }catch(error){
          console.log("error at post comment:", error);
        }
    });

    socket.on('delete community comment', function(data){
        try{
            CommunityPost.findById(data.c_id, function(err, post){
                if (err) {
                    console.log(err);
                } else{
                    post.replys.splice(data.r_id, 1);
                    post.save(function (err) {
                        if (err) {
                            console.log(err);
                        }
                    });
                }
            });
        }catch(error){
            console.log("error at delete community comment:", error)
        }
    });

    socket.on('update postComment', function(data){
        try{
            CommunityPost.findById(data.c_id, function(err, doc){
                if (err) console.log(err);

                comment = doc.replys[data.r_id];
                comment.content = data.msg;
                doc.replys[data.r_id] = comment;
                doc.save();
            });
        }catch(error){
            console.log("error at update community comment:", error)
        }
    });

    socket.on('delete community post', function(c_id){
        try{
            CommunityPost.find({'_id':c_id}).remove().exec();
            CommunityPost.find({'content_id':c_id}).remove().exec();
            SharePost.find({'content_id':c_id}).remove().exec();
            LikePost.find({'content_id':c_id}).remove().exec();
        }catch(error){
            console.log("error at delete community comment:", error)
        }
    });

    socket.on('delete upcoming comment', function(c_id){
        UpcomingPost.find({'_id':c_id}).remove().exec();
    });

    socket.on('update upcomingComment', function(data){
        UpcomingPost.findById(data.c_id, function(err, doc){
            if (err) console.log(err);

            doc.content = data.msg;
            doc.save();
        });
    });

    socket.on('update portfolioComment', function(data){
        PortfolioPost.findById(data.c_id, function(err, doc){
            if (err) console.log(err);

            doc.content = data.msg;
            doc.save();
        });
    });

    socket.on('delete portfolio comment', function(c_id){
        PortfolioPost.find({'_id':c_id}).remove().exec();
    });

    //socket.emit('update postContent', {msg:post_val, c_id:c_id, uid:{{user.id}} });
    socket.on('update postContent', function(data){
        CommunityPost.findById(data.c_id, function(err, doc){
            if (err) console.log(err);

            doc.content = data.msg;
            doc.save();
        });
    });

    socket.on('upcoming comment', function(data, callback){
        var d = new Date();
        
        var newPost = new UpcomingPost({content:data.msg, to_uid:data.to, user:{uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname}});
        newPost.save(function(err){
            if (err) {
                console.log(err);
            } else{
                if (users[data.to]) {
                    users[data.to].emit('new upcoming comment', {msg:data.msg, from_uid:socket.uid, from_firstname:socket.firstname, from_lastname:socket.lastname});
                }
             
                if (data.uid) {
                    users[data.uid].emit('new upcoming comment on userpage', {msg:data.msg, to:data.to, from_uid:socket.uid, from_firstname:socket.firstname, from_lastname:socket.lastname});
                }
            }
        });
    });

    socket.on('portfolio comment', function(data, callback){
        var d = new Date();
        
        var newPost = new PortfolioPost({content:data.msg, to_uid:data.to, p_id:data.p_id, user:{uid:socket.uid, first_name:socket.firstname, last_name:socket.lastname}});
        newPost.save(function(err, post){
          if (err) {
            console.log(err);
          } else{
            /*
            if (users[data.to]) {
                users[data.to].emit('new portfolio comment', {msg:data.msg, from_uid:socket.uid, from_firstname:socket.firstname, from_lastname:socket.lastname, p_id:data.p_id});
            }
            */
           
            if (data.uid) {
                users[data.uid].emit('new portfolio comment', {msg:data.msg, to:data.to, from_uid:socket.uid, from_firstname:socket.firstname, from_lastname:socket.lastname, p_id:data.p_id});
            }
          }

        });
    });

    socket.on('add community members', function(data){
        try{
            var uid1, uid2, action_user;
            if (data.sid < data.rid){
                uid1 = data.sid;
                uid2 = data.rid; 
                action_user = 1;
            }else{
                uid2 = data.sid;
                uid1 = data.rid; 
                action_user = 2;
            }
        
            FollowPost.findOne({uid1:uid1, uid2:uid2}).exec(function(err, result){
                if(err){
                }else{
                    if(!result){
                        var newPost = new FollowPost({uid1:uid1, uid2:uid2, action_user:action_user, status:1});
                        newPost.save(function(err){
                            if (err) {
                                console.log(err);
                            } else{
                                socket.emit('new history', {to_uid:data.to_uid, content_type:1, action_id:8});
                                if (data.to_uid in users){
                                    users[data.to_uid].emit('new notification', {action_id:8, from_uid:socket.uid, from_first_name:socket.firstname, from_lastname:socket.lastname});
                                }
                            }
                        }); 
                    }else{
                        if (result.action_user != action_user && result.status != 2){
                            result.status = 2;
                            result.save();
                            CommunityMember.findOne({uid:uid1}).exec(function(err, result){
                                if (result){
                                    result.friends.push(uid2);
                                    result.save(function (er) {
                                      console.log("friends saved");
                                    });
                                }else{
                                    var cm = new CommunityMember({uid:uid1, friends:[uid2]})
                                    cm.save(function(e){
                                      console.log("new friends saved");
                                    })
                                }
                            });

                            CommunityMember.findOne({uid:uid2}).exec(function(err, result){
                                if(result){
                                    result.friends.push(uid1);
                                    result.save(function (err) {
                                      console.log("friends saved");
                                    });
                                }else{
                                    var cm = new CommunityMember({uid:uid2, friends:[uid1]})
                                    cm.save(function(e){
                                      console.log("new friends saved");
                                    })
                                }
                            });
                        }
                    }
                }
            });
        }catch(error){
            console.log("error at add community members:", error)
        }
    });

    socket.on('list profession collaborators', function(profession){
        try{
            var pool = new pg.Pool(pgConfig);

            pool.connect(function(err, client, release) {
                var profession_query = `
                  SELECT week1_user.uid as user_id, week1_user.first_name, week1_user.last_name, week1_profile.photo,
                         week1_profile.profession1, week1_profile.profession2, week1_profile.profession3, week1_profile.describe
                  FROM week1_profile, week1_user
                  WHERE week1_user.uid!='${socket.uid}' AND week1_profile.user_id=week1_user.id
                  AND ( week1_profile.profession1='${profession}' OR week1_profile.profession2='${profession}' OR week1_profile.profession3='${profession}'
                        OR week1_profile.profession4='${profession}' OR week1_profile.profession5='${profession}')
                `;

                client.query(profession_query, function(err, result){
                    release();
                    if (err) {
                        return console.error('Error executing query', err.stack)
                    }
                    socket.emit('get users by profession', result.rows);
                });
            });
        }catch(error){
            console.log("error at list profession collaborators:", error)
        }
    });

    socket.on('search query', function(query){
        try{
            var pool = new pg.Pool(pgConfig);

            pool.connect(function(err, client, release) {
                var profession_query = `
                  SELECT week1_user.uid as user_id, week1_user.first_name, week1_user.last_name, week1_profile.photo,
                         week1_profile.profession1, week1_profile.profession2, week1_profile.profession3, week1_profile.describe
                  FROM week1_profile, week1_user
                  WHERE week1_user.uid!='${socket.uid}' AND week1_profile.user_id=week1_user.id
                  AND ( week1_profile.profession1='${query}' OR week1_profile.profession2='${query}' OR week1_profile.profession3='${query}'
                        OR week1_profile.profession4='${query}' OR week1_profile.profession5='${query}')
                `;

                client.query(profession_query, function(err, result){
                    release();
                    if (err) {
                        return console.error('Error executing query', err.stack)
                    }
                    socket.emit('get search result by profession', result.rows);
                });
            });

            pool.connect(function(err, client, release) {
                var skill_query = `
                  SELECT week1_user.uid as user_id, week1_user.first_name, week1_user.last_name, week1_profile.photo,
                         week1_profile.profession1, week1_profile.profession2, week1_profile.profession3, week1_profile.describe
                  FROM week1_profile, week1_user
                  WHERE week1_user.uid!='${socket.uid}' AND week1_profile.user_id=week1_user.id
                  AND ( week1_profile.skill1='${query}' OR week1_profile.skill2='${query}' OR week1_profile.skill3='${query}'
                        OR week1_profile.skill4='${query}' OR week1_profile.skill5='${query}' OR week1_profile.skill6='${query}'
                        OR week1_profile.skill7='${query}' OR week1_profile.skill8='${query}' OR week1_profile.skill9='${query}' OR week1_profile.skill10='${query}')
                `;

                client.query(skill_query, function(err, result){
                    release();
                    if (err) {
                        return console.error('Error executing query', err.stack)
                    }
                    socket.emit('get search result by skill', result.rows);
                });
            });

            pool.connect(function(err, client, release) {
                var username_query = `
                  SELECT week1_user.uid as user_id, week1_user.first_name, week1_user.last_name, week1_profile.photo,
                         week1_profile.profession1, week1_profile.profession2, week1_profile.profession3, week1_profile.describe
                  FROM week1_profile, week1_user
                  WHERE week1_user.uid!='${socket.uid}' AND week1_profile.user_id=week1_user.id
                  AND ( week1_user.first_name='${query}' OR week1_user.last_name='${query}' )
                `;

                client.query(username_query, function(err, result){
                    release();
                    if (err) {
                        return console.error('Error executing query', err.stack)
                    }
                    socket.emit('get search result by user name', result.rows);
                });
            });

            pool.connect(function(err, client, release) {
                var portfolio_query = `
                  SELECT week1_user.uid as user_id, week1_user.first_name, week1_user.last_name, week1_showcase.title, week1_showcase.image,
                         week1_showcase.tag1, week1_showcase.tag2, week1_showcase.tag3, week1_showcase.describe
                  FROM week1_showcase, week1_user
                  WHERE week1_user.uid!='${socket.uid}' AND week1_showcase.user_id=week1_user.id
                  AND ( week1_showcase.tag1='${query}' OR week1_showcase.tag2='${query}' )
                `;

                client.query(portfolio_query, function(err, result){
                    release();
                    if (err) {
                        return console.error('Error executing query', err.stack)
                    }
                    socket.emit('get search result by portfolio', result.rows);
                });
            });

            pool.connect(function(err, client, release) {
                var upcoming_query = `
                  SELECT week1_user.uid as user_id, week1_user.first_name, week1_user.last_name, week1_upcomingwork.title, week1_upcomingwork.image,
                         week1_upcomingwork.tag1, week1_upcomingwork.tag2, week1_upcomingwork.tag3, week1_upcomingwork.describe
                  FROM week1_upcomingwork, week1_user
                  WHERE week1_user.uid!='${socket.uid}' AND week1_upcomingwork.user_id=week1_user.id
                  AND ( week1_upcomingwork.tag1='${query}' OR week1_upcomingwork.tag2='${query}' )
                `;

                client.query(upcoming_query, function(err, result){
                    release();
                    if (err) {
                        return console.error('Error executing query', err.stack)
                    }
                    socket.emit('get search result by upcoming', result.rows);
                });
            });
            pool.end()
        }catch(error){
          console.log("error at search query:", error)
        }
    });


    socket.on('send message', function(data){
        try{
            if(data.to_uid){
                var uid1, uid2, action_user;
                if (data.uid < data.to_uid){
                    uid1 = data.uid;
                    uid2 = data.to_uid; 
                    action_user = 1;
                }else{
                    uid2 = data.uid;
                    uid1 = data.to_uid; 
                    action_user = 2;
                }

                MessageRelation.findOne({ uid1:uid1, uid2:uid2 }).exec(function(err, result){
                    if (err) {
                        console.log(err);
                    }else {
                        if (result){
                            if(data.data && data.data != {}){
                                result.messages.push({uid:data.uid, content:data.msg, image:{data:data.data['file'], contentType: data.data['type']}});
                            }else{
                                result.messages.push({uid:data.uid, content:data.msg});
                            }
                            result.save(function (error) {
                                if (!error) {
                                    console.log('Succeed to send message!');
                                }
                                socket.join(result._id);
                                //socket.emit('new message', {uid:data.uid, content:data.msg});
                                io.sockets.in(result._id).emit('new message', {uid:data.uid, to_uid:data.to_uid, content:data.msg, room_id:result._id, image:data.data});
                            });
                        }else{
                            var newMessageRelation = new MessageRelation({uid1:uid1, uid2:uid2, action_user:action_user, status:1, messages:{uid:socket.uid, content:data.msg}});
                            newMessageRelation.save(function(error, newdata){
                                if (error) {
                                    console.log(error);
                                }else{
                                    /** emmit new message to data.to_uid message.html **/
                                    if (users[data.to_uid]){
                                        users[data.to_uid].emit('new message', {uid:socket.uid, msg:data.msg, room_id:newdata._id}) 
                                    }
                                }
                            });
                        }
                    }
                });
            }else if(data.room_id){
                MessageRelation.findById(data.room_id, function(err, result){
                    if (err) {
                        console.log(err);
                    }else {
                        if (result){
                            if(data.data && data.data != {}){
                                result.messages.push({uid:data.uid, content:data.msg, image:{data:data.data['file'], contentType: data.data['type']}});
                            }else{
                                result.messages.push({uid:data.uid, content:data.msg});
                            }
                            result.save(function (error) {
                                if (!error) {
                                    console.log('Succeed to send message!');
                                }
                                socket.join(result._id);
                                io.sockets.in(result._id).emit('new message', {uid:data.uid, to_uid:data.to_uid, content:data.msg, room_id:result._id, image:data.data});
                            });
                        }
                    }
                });
            }
        }catch(error){
            console.log("error at send message:", error)
        }
    });

    socket.on('get message', function(data){
        try{
            var uid1, uid2, action_user;
            if (socket.uid < data.to_uid){
              uid1 = socket.uid;
              uid2 = data.to_uid; 
              action_user = 1;
            }else{
              uid2 = socket.uid;
              uid1 = data.to_uid; 
              action_user = 2;
            }

            MessageRelation.findOne({ uid1:uid1, uid2:uid2 }).exec(function(err, result){
                if (err) {
                    console.log(err);
                }else {
                    if (result){
                        socket.join(result._id);
                        socket.emit('set message', result);
                    }else{
                        var newMessageRelation = new MessageRelation({uid1:uid1, uid2:uid2, action_user:action_user, status:1 });
                        newMessageRelation.save(function(error, newdata){
                            if (error) {
                                console.log(error);
                            }else{
                                /** emmit new message to data.to_uid message.html **/
                                socket.emit('set message', newdata) 
                            }
                        });
                    }
                }
            });
        }catch(error){
          console.log("error at get message:", error)
        }
    });

    /***
    uid1: Number,
    uid2: Number,
    action_user: Number,//1 or 2
    status: Number,//1: sent request, 2:accepted, 3:blocked
    **/

    socket.on('start message', function(data){
        try{
            var uid1, uid2, action_user;
            if (socket.uid < data.to_uid){
                uid1 = socket.uid;
                uid2 = data.to_uid; 
                action_user = 1;
            }else{
                uid2 = socket.uid;
                uid1 = data.to_uid; 
                action_user = 2;
            }

            MessageRelation.findOne({ uid1:uid1, uid2:uid2 }).exec(function(err, result){
                if (err) {
                    console.log(err);
                }else {
                    if (!result){
                        var newMessageRelation = new MessageRelation({uid1:uid1, uid2:uid2, action_user:action_user, status:1, messages:{uid:socket.uid, content:data.msg}});
                        newMessageRelation.save(function(error, newdata){
                            if (error) {
                                console.log(error);
                            }else{
                                /** emmit new message to data.to_uid message.html **/
                                if (users[data.to_uid]){
                                  users[data.to_uid].emit('send first message', {uid:socket.uid, msg:data.msg, room_id:newdata._id}) 
                                }
                            }
                        });
                    } else{
                        socket.emit();
                    }
                }
            });
        }catch(error){
            console.log("error at start message:", error)
        }
    });

    socket.on('accept first message', function(data){
        try {
            var uid1, uid2, action_user;
            if (socket.uid < data.to_uid){
                uid1 = socket.uid;
                uid2 = data.to_uid; 
                action_user = 1;
            }else{
                uid2 = socket.uid;
                uid1 = data.to_uid; 
                action_user = 2;
            }

            var query = { uid1:uid1, uid2:uid2 };
            var option = {upsert:false};

            MessageRelation.update(query, {action_user:action_user, status:2}, option, function(err, raw){
                if ( err ) console.log(err);
                socket.emit('new accept user', {uid:data.to_uid, msg:data.msg, room_id:data.room_id});
            });
        }catch(error){
            console.log("error at accept first message:", error)
        }
    });
    
    socket.on('block first message', function(data){
        try {
            var uid1, uid2, action_user;
            if (socket.uid < data.to_uid){
                uid1 = socket.uid;
                uid2 = data.to_uid; 
                action_user = 1;
            }else{
                uid2 = socket.uid;
                uid1 = data.to_uid; 
                action_user = 2;
            }

            var query = { uid1:uid1, uid2:uid };
            var option = {upsert:false};

            MessageRelation.update(query, {action_user:action_user, status:3}, option, function(err, raw){
                if ( err ) console.log(err);
                socket.emit('new block user', data.to_uid);
            });
        }catch(error){
            console.log("error at block first message:", error)
        }
    });

    socket.on('disconnect', function(){
        if (!socket.uid) return ;
        delete users[socket.uid];
        updateUids();

        delete chatusers[socket.uid];
        updatechatUids();
    });
});

http.listen(3000, function(){
    console.log('listening on *:3000');
});

