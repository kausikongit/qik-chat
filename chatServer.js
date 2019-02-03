var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var fs = require("fs");
//var users = {}; 
var rooms = {}; 
var files = {}; 

var port = 8080; 
server.listen(port, function () {
   var host = server.address().address;
   var port = server.address().port;
   console.log("Chat Server is running on host:%s port:%s", host,port);
});

app.use(express.static(__dirname + '/public'));
// parse application/json
app.use(express.json());
// parse application/x-www-form-urlencoded
app.use(express.urlencoded({extended: true}));

/************* Read user data from file ***************
var users = readJsonFileSync(__dirname + '/public/files/users.json');*/

app.get('/', function (req, res) {
   res.send('Hello World');
});

app.get('/chat-room', function (req, res) {
   res.sendFile(__dirname + '/public/chatRoom.html');
});

app.post('/createRoom', function(req, res){
	console.log('body: ' + JSON.stringify(req.body));
  var uname = req.body.uname; 
  var rname = req.body.rname; 
  if(uname && rname){
    var roomid = generateRoomId();
    var uid = generateUid();
    var ucolor = getRandomColor();
    rooms[roomid] = {};
    rooms[roomid]["users"] = {};
    rooms[roomid]["msgs"] = {}; 
    rooms[roomid]["users"][uid] = {uname:uname,ucolor:ucolor};
    rooms[roomid]["rname"] = rname;
    console.log("A new room '%s' has been create with Room ID:%s",rname,roomid);
    res.send({validity:"valid",uname:uname,uid:uid,roomid:roomid,rname:rname,msg:"A new Room created with Room ID:"+roomid});
    return void 0;
  }
 
  res.send({"validity":"invalid","msg":"Invalid User Name or Room Name"});
});

app.post('/joinRoom', function(req, res){
	//console.log('body: ' + JSON.stringify(req.body));
  var uname = req.body.uname; 
  var roomid = req.body.roomid; 
  var ucolor = getRandomColor();
  
  if(!rooms[roomid]){
    res.send({"validity":"invalid","msg":"Room not found !"});
    return void 0; 
  }else {
    var uid = generateUid();
    var rname = rooms[roomid].rname;
    rooms[roomid]["users"][uid] = {uname:uname,ucolor:ucolor};
    console.log("A new user %s [%s] has been joined in Room ID:%s [%s]",uid,uname,rname,roomid);
    res.send({validity:"valid",uname:uname,uid:uid,roomid:roomid,rname:rname,msg:"A new Room created with Room ID:"+roomid});
  }
});

function generateRoomId(){
  var roomId = get4DigitRandom();//+"-"+get4DigitRandom();
  
  if(rooms[roomId])
    generateRoomId();
  else 
    return roomId; 
  //return "1111";
  
}/*End generateRoomId()*/

function generateUid(){
  var uid = "user"+(new Date().getTime());
  return uid; 
}/*End generateUid()*/

function get4DigitRandom(){
  return Math.floor(1000 + Math.random() * 9000);
}/*End get4DigitRandom()*/

function getLocalTimestamp() {
  var now = new Date(),
      tzo = -now.getTimezoneOffset(),
      dif = tzo >= 0 ? '+' : '-',
      pad = function(num) {
        var norm = Math.abs(Math.floor(num));
        return (norm < 10 ? '0' : '') + norm;
      };
  return now.getFullYear() 
    + '-' + pad(now.getMonth()+1)
    + '-' + pad(now.getDate())
    + 'T' + pad(now.getHours())
    + ':' + pad(now.getMinutes()) 
    + ':' + pad(now.getSeconds()) 
    + dif + pad(tzo / 60) 
    + ':' + pad(tzo % 60);
}/*End formatLocalDate()*/

/*******************Configuring socket.io events***************/
io.on('connection', function (socket) {
  socket.on("regUser",function(data){
    try {
      socket.uid = data.uid; 
      socket.roomid = data.roomid; 
      socket.uname = rooms[socket.roomid]["users"][socket.uid]["uname"];
      socket.ucolor = rooms[socket.roomid]["users"][socket.uid]["ucolor"];
      socket.room = socket.roomid;         
      socket.join(socket.roomid);
      rooms[socket.roomid]["users"][socket.uid].status = "connected";
      rooms[socket.roomid]["users"][socket.uid]["connectedOn"] = getLocalTimestamp();
      rooms[socket.roomid]["users"][socket.uid]["socketId"] = socket.id;
      emitUserList();
      console.log("User %s [%s] is connected now...",socket.uid,socket.uname);
    }catch(ex){
      console.log(ex);
    }
  });
  
  socket.on("syncMsgs",function(data){
    syncMsgs(data);
  });

  socket.on('disconnect', function () {
    try {
      rooms[socket.roomid]["users"][socket.uid].status = "disconnected";
      console.log("User %s [%s] has been Disconnected.",socket.uid,socket.uname);
      emitUserList();
      
      var activeCount = 0; 
      for(var user in rooms[socket.roomid]["users"]){
        if(rooms[socket.roomid]["users"][user].status === "connected")
          activeCount++;
      }
      if(activeCount === 0){
        console.log("The room %s [%s] now closed...",rooms[socket.roomid].rname,socket.roomid);
        delete rooms[socket.roomid];
      }
      socket.leave(socket.room);  
    }catch(ex){
      console.log(ex);
    }
  });
  
  function emitUserList(){
    var users = rooms[socket.roomid]["users"];
    var uList = {};
    for(var user in users){
      if(users[user].status === "connected")
      uList[user] = JSON.parse(JSON.stringify(users[user]));
    }
    io.sockets["in"](socket.room).emit('updateUserList', uList);
  }
  
  /*If user refresh of join later then messages can be sync*/
  function syncMsgs(data){
    try {
      var msgSet = {}; 
      var syncUser = data.syncUser; 
      if(data.paneId === "pane-all-all" && rooms[socket.roomid]["msgs"]["msgs-all-all"])
        msgSet = JSON.parse(JSON.stringify(rooms[socket.roomid]["msgs"]["msgs-all-all"]));
      else if(rooms[socket.roomid]["msgs"]["msgs-"+socket.uid+"-"+syncUser])
        msgSet = JSON.parse(JSON.stringify(rooms[socket.roomid]["msgs"]["msgs-"+socket.uid+"-"+syncUser]));
      else if(rooms[socket.roomid]["msgs"]["msgs-"+syncUser+"-"+socket.uid])
        msgSet = JSON.parse(JSON.stringify(rooms[socket.roomid]["msgs"]["msgs-"+syncUser+"-"+socket.uid]));
      data.msgSet = msgSet; 
      socket.emit("syncMsgs",data);
    }catch(ex){
      console.log(ex);
    }
  }
  
  /*when a new message arrive emit to every user on same room*/
  socket.on("sendMsg",function(data){
    data.sentTime = getLocalTimestamp();
    data.fromUid = socket.uid;
    data.fromUname = socket.uname; 
    data.msgid = "msg"+(new Date().getTime())+get4DigitRandom();
    data.ucolor = socket.ucolor; 
    if(data.toId === "all"){
      if(!rooms[socket.roomid]["msgs"]["msgs-all-all"])rooms[socket.roomid]["msgs"]["msgs-all-all"] = [];
      rooms[socket.roomid]["msgs"]["msgs-all-all"].push(data);
      io.sockets["in"](socket.room).emit("newMsg",data);
    }
    else {
      /*decide pane id to store msg data for refere it later*/
      var toSocket = rooms[socket.roomid]["users"][data.toId]["socketId"];
      if(!rooms[socket.roomid]["msgs"]["msgs-"+data.toId+"-"+data.fromUid] && !rooms[socket.roomid]["msgs"]["msgs-"+data.fromUid+"-"+data.toId]){
        rooms[socket.roomid]["msgs"]["msgs-"+data.toId+"-"+data.fromUid] = [data];
      }
      else if(rooms[socket.roomid]["msgs"]["msgs-"+data.toId+"-"+data.fromUid]){
        rooms[socket.roomid]["msgs"]["msgs-"+data.toId+"-"+data.fromUid].push(data);
      }else{
        rooms[socket.roomid]["msgs"]["msgs-"+data.fromUid+"-"+data.toId].push(data);
      }
      io.to(toSocket).emit("newMsg",data);
      socket.emit("newMsg",data);
    }
    
    /*Index files separately to transfer it later*/
    if(data.type === "file")
      files[data.fileId] = data; 
    
    /*** only for debugging purpose ****/
    io.sockets["in"](socket.room).emit('debug', rooms);
  });
  
  
  socket.on("downloadFile",function(data){
    var fileId = data.fileId;
    if(files[fileId]){
      var uploadedFromUid = files[fileId]["fromUid"]; 
      var uploadedFromSocket = rooms[socket.roomid]["users"][uploadedFromUid].socketId; 
      io.to(uploadedFromSocket).emit("transferFile",{fileId:files[fileId].fileId,toSocket:socket.id});
      //socket.emit("receiveFile",files[fileId]);
    }
  }); 
  
  socket.on("transferFile",function(data){
    var fileData = JSON.parse(JSON.stringify(files[data.fileId]));
    fileData["file"] = data.file; 
    console.log(JSON.stringify(fileData));
    io.to(data.toSocket).emit("receiveFile",fileData);
  });
  
  
  /*When user start typing*/
  socket.on("startTyping",function(data){
    data.uid = socket.uid;
    data.uname = socket.uname; 
    if(data.toId === "all")
      io.sockets["in"](socket.room).emit("startTyping",data);
    else{
      var toSocket = rooms[socket.roomid]["users"][data.toId]["socketId"];
      io.to(toSocket).emit("startTyping",data);
    }
  });
  
  /*When user end typing*/
  socket.on("endTyping",function(data){
    data.uid = socket.uid;
    data.uname = socket.uname; 
    if(data.toId === "all")
      io.sockets["in"](socket.room).emit("endTyping",data);
    else{
      var toSocket = rooms[socket.roomid]["users"][data.toId]["socketId"];
      io.to(toSocket).emit("endTyping",data);
    }
  });
  
});


function getRandomColor() {
  var letters = '0123456789ABCDEF';
  var color = '#';
  for (var i = 0; i < 6; i++ ) {
      color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}/*End getRandomColor()*/

function readJsonFileSync(filepath, encoding){
  if (typeof (encoding) === 'undefined'){
      encoding = 'utf8';
  }
  var file = fs.readFileSync(filepath, encoding);
  return JSON.parse(file);
}/*End readJsonFileSync()*/

console.log("Chat Server has started...");