

/*
 * 
 * サーバー側のメインプログラムです。
 * 名前はmainとしましたが、nodejsではなんだかそう命名するらしいので
 * こうしました。
 */

//Daraクラスはサーバーで使うデータを扱います。
//具体的にはclientとroomの2つです。
//clientは接続してきたクライアントの情報を扱います。
//roomはマルチプレイルームのそれぞれを管理します。

class Data
{
    static init()
    {
        this.client = [];
        this.room = [];
        for (let i = 0; i < 30; i++)
            this.client_reset(i);
        for (let i = 0; i < 3; i++)
            this.room_reset(i);
    }

    static client_reset(i)
    {
        /*クライアントの情報は
         * life
         * socket
         * ping
         * state
         * roomID
         * memberID
         * 
         * です。
         * lifeは接続が維持されているかどうかを表しています。
         * socketは通信に使うソケット自体を代入します。
         * pingは通信が維持されているかどうか調べるための変数です。
         * stateは今のクライアントの状態を入れます。
         * roomID memberIDはマルチプレイルームの部屋番とメンバーIDをいれます。
         */
        this.client[i] = {
            life: "vacant",
            socket: null,
            ping: 0,
            state: null,
            roomID: null,
            memberID: null,
        };
    }

    static room_reset(i)
    {
        /*
         * マルチプレイルームの情報を扱います。       
         * マルチプレイルームは３つなのでthis.roomも３つあります。
         * map
         * host
         * member
         * state
         * 
         * Discussion{
         * vote_array
         * expel
         * 
         * }
         *   
         * 
         */
        this.room[i] = {
            map: 0,
            member: [],
            state: "idle",
            host: -1,

            Discussion: {
                vote_array: [
                    [],
                    [],
                    [],
                    [],
                    [],
                    [],
                    [],
                    [],
                    [],
                ],
                expel: [],
            }
        };
        for (let j = 0; j < 8; j++)
            this.member_reset(i, j);
    }

    static member_reset(i, j)
    {
        this.room[i].member[j] = {
            color: null,
            x: 0,
            y: 0,
            life: "alive",
            direct: 0,
            pose: 1,
            controll: "auto",
            action: "wait",
            route: [],
            target: [],
            route_time: [0, 0],
            walk: [0, null, null],
            wait_time: [0, 0],
            speed: 1,
            role: "clue",
            task: -1,
            report_time: 0,
            stop: false,
        }
    }

}


class Launcher
{
    static start()
    {
        let a = require("http");
        let b = require("ws");
        const http = a.createServer();
        const websocket = new b.Server({noServer: true});
        let past_connect = null;
        //通信をwebsocket用にアップグレードする時を捕まえる関数らしい
        http.on("upgrade", (req, soc, head) => {
            let ip = req.headers['x-forwarded-for'];
            if (ip == null)
                ip = req.connection.remoteAddress;
            if (past_connect == null)
                past_connect = [new Date(), ip];
            else {
                if (past_connect[1] == ip) {
                    //もしあまりに早く(0.2秒以内)connectionを求めている場合は拒否
                    if (new Date() - past_connect[0] < 200) {
                        console.log("socket destroy: " + new Date());
                        soc.destroy();
                    }
                }
                past_connect = [new Date(), ip];
            }

            //問題がなければwebsocketへupgrade
            websocket.handleUpgrade(req, soc, head, (ws) => {
                websocket.emit("connection", ws);
            });
        });

        //初めて接続したときはここで処理する
        websocket.on("connection", (connect_socket) => {

            //このゲームは３０人しか同時接続できない設定にしているので
            //３０人以上接続があったら弾くようにしています。            
            //また、３０以下だったときはそれぞれにナンバーをつけて管理します。

            let check = true;
            for (let i = 0; i < Data.client.length; i++)
                if (Data.client[i].socket == null)
                {
                    Data.client[i].life = "connect";
                    //通信に使うsocket自体を変数に代入しています。
                    //このサーバーではこの代入されたsocketを使ってサーバー側からの送信をしています。
                    Data.client[i].socket = connect_socket;
                    Data.client[i].ping = 0;
                    connect_socket.send(JSON.stringify({
                        type: "set_id",
                        text: i
                    }));
                    Data.client[i].state = "selectRoom";
                    check = false;
                    break;
                }

            //いっぱいだったら「満員です」と返す
            if (check)
            {
                connect_socket.send(JSON.stringify({
                    type: "client_full"
                }));
            }

            //その後、双方向通信する処理をここから記述する。
            //ここに記述されているものは、いわゆるイベントドリブンの関数で、
            //クライアント側から要求のきたものを処理している。
            connect_socket.on("message", (message_data) => {

                //receive_messageはここではとても重要な変数です。
                //クライアントからの送信内容はすべてmessage_dataに入ってきます。
                //それを解析してくれるのがJSON.parseで、その内容を受け取るのがreceive_messageです。
                //解析と入っても、送信時にこちらの決めた内容で送ってくるので
                //そのとおりに情報を並べ替えてもらうだけです。

                //具体的には、このゲームではたいてい、typeというキーが入っています。
                //これはnodejsで決まっていたものではなく、私が使いやすいようにそう決めただけです。
                //その他にもtypeの内容によってroomIDやmemberIDなどそれぞれのtypeに応じた他のキーを
                //私が準備しておきますので、それをサーバーが受け取って
                //さらに何かしら加工・送信するという流れになっています。


                let receive_message = JSON.parse(message_data);

                //pingpong通信です。
                //クライアントがいるかどうかを調べるためにただただ通信をしています。
                //１秒くらい返ってこなかったら切断処理をします。
                if (receive_message.type == "pong")
                    Data.client[receive_message.ID].ping = 0;

                //待合室に行くとクライアントから言われたときです。
                if (receive_message.type == "gotoWaitRoom")
                {
                    let a = -1;
                    let b = -1;
                    let d = 0;
                    while (true)
                    {
                        //キャラクターの座る位置（机の周りに座る位置）を決めています。
                        //他のキャラとかぶらないように工夫しています。
                        a = Math.floor(Math.random() * 8);
                        if (Data.room[receive_message.room].member[a].color == null)
                        {
                            Data.room[receive_message.room].member[a].color = "reserved";
                            break;
                        }
                        d++;
                        if (d > 10)
                            break;
                    }

                    d = 0;
                    while (true)
                    {
                        //キャラクターの色を決めています。
                        b = Math.floor(Math.random() * 8);
                        let c = true;
                        for (let j = 0; j < 8; j++)
                            if (Data.room[receive_message.room].member[j].color == b)
                                c = false;
                        if (c)
                            break;
                        d++;
                        if (d > 10)
                            break;
                    }

                    //「このクライアントは待ち合い室に活きました」とサーバー側で分類します。
                    Data.client[receive_message.socketID].state = "waitRoom";
                    Data.client[receive_message.socketID].roomID = receive_message.room;
                    //その際のルーム番号・メンバー番号をクライアントに紐つけます。
                    Data.client[receive_message.socketID].memberID = a;
                    Data.room[receive_message.room].member[a].color = b;
                    Data.room[receive_message.room].member[a].x = 4 * 64;
                    Data.room[receive_message.room].member[a].y = 7 * 64;
                    Data.room[receive_message.room].member[a].direct = 0;
                    Data.room[receive_message.room].member[a].pose = 1;
                    Data.room[receive_message.room].member[a].controll = "manual";

                    //クライアントにメンバーIDとルームIDを送信
                    connect_socket.send(JSON.stringify({
                        type: "reply_gotoWaitRoom",
                        roomID: receive_message.room,
                        memberID: a,
                        roomMember: Data.room[receive_message.room].member
                    }));
                }

                //逆にセレクトルームに戻ってくるとき
                if (receive_message.type == "gotoSelectRoom")
                {
                    //クライアントの情報を書き換えて、ルーム側のデータも書き換えます。
                    Data.client[receive_message.socketID].state = "selectRoom";
                    Data.client[receive_message.socketID].roomID = null;
                    Data.client[receive_message.socketID].memberID = null;
                    Data.member_reset(receive_message.roomID, receive_message.memberID);
                }

                //ユーザーが操作しているキャラクターが移動した場合に"pos_send"が送信されます。
                if (receive_message.type == "pos_send")
                {
                    //マルチプレイのときはルームIDとメンバーIDが一緒に送られてきているので、
                    //それをもとに情報を更新します。               
                    Data.room[receive_message.roomID].member[receive_message.memberID].x = receive_message.info.x;
                    Data.room[receive_message.roomID].member[receive_message.memberID].y = receive_message.info.y;
                    Data.room[receive_message.roomID].member[receive_message.memberID].life = receive_message.info.life;
                    Data.room[receive_message.roomID].member[receive_message.memberID].direct = receive_message.info.direct;
                    Data.room[receive_message.roomID].member[receive_message.memberID].pose = receive_message.info.pose;
                }

                //チャットが送信されたときです。
                if (receive_message.type == "chat")
                {
                    for (let i = 0; i < Data.client.length; i++)
                    {
                        //待合室にいるとき、キャラクターは吹き出しを出して会話をしています。                                                        
                        if (Data.client[i].state == "waitRoom")
                            if (receive_message.roomID == Data.client[i].roomID)
                                if (receive_message.memberID != Data.client[i].memberID)
                                {
                                    Data.client[i].socket.send(JSON.stringify({
                                        type: "chat_info",
                                        memberID: receive_message.memberID,
                                        message: receive_message.message
                                    }));
                                }
                    }
                }

                //作業画面が始まるとき、各ユーザーから「準備OK」の通知が来ます。
                //すべてのユーザーからOKがきたら次の画面へ遷移するよう通知を一斉に出します。
                if (receive_message.type == "ready_start")
                {
                    Data.room[receive_message.roomID].state = "ready_start";
                    Data.client[receive_message.socketID].state = "ready_start";
                }

                //host_callは待合室でスタートボタンが押されたときに飛んでくる要求です。
                //ここで行われていることは、
                //作業画面での机の周りにキャラクターを配置すること
                //ユーザーがついていないキャラクターに対して番号と色を用意すること
                //そして誰がインポスターなのかを決めることです。
                if (receive_message.type == "host_call")
                {
                    Data.room[receive_message.roomID].state = "work";
                    Data.room[receive_message.roomID].map = receive_message.map;

                    //作業ボタンを押したクライアントからキャラの初期位置が送られてきているので
                    //それをサーバー側のデータに代入します。
                    for (let i = 0; i < Data.room[receive_message.roomID].member.length; i++)
                    {
                        Data.room[receive_message.roomID].member[i].x = receive_message.pos[i].x;
                        Data.room[receive_message.roomID].member[i].y = receive_message.pos[i].y;
                        Data.room[receive_message.roomID].member[i].direct = receive_message.pos[i].direct;
                        Data.room[receive_message.roomID].member[i].pose = receive_message.pos[i].pose;

                        //まだ色の決まっていないキャラに番号と色を用意しています。
                        if (Data.room[receive_message.roomID].member[i].controll == "auto")
                        {
                            while (true)
                            {
                                let a = Math.floor(Math.random() * 8);
                                let b = true;
                                for (let j = 0; j < Data.room[receive_message.roomID].member.length; j++)
                                {
                                    if (Data.room[receive_message.roomID].member[j].color == a)
                                        b = false;
                                }
                                if (b)
                                {
                                    Data.room[receive_message.roomID].member[i].color = a;
                                    break;
                                }
                            }
                        }
                    }

                    //ここがインポスターを選んでいるところです。
                    //ランダムで誰にするか決めています。                                
                    let c = Math.floor(Math.random() * 8);
                    Data.room[receive_message.roomID].member[c].role = "imposter";

                    //      for (let i = 0; i < Data.client.length; i++)
                    //         if (receive_message.socketID == i)
                    //            Data.room[Data.client[i].roomID].member[Data.client[i].memberID].role = "imposter";


                    //準備ができたらデータをクライアントへ送信します。
                    for (let i = 0; i < Data.client.length; i++)
                        if (Data.client[i].roomID == receive_message.roomID)
                        {
                            Data.client[i].state = "work";
                            Data.client[i].socket.send(JSON.stringify({
                                type: "work_init",
                                member: Data.room[receive_message.roomID].member,
                                map: Data.room[receive_message.roomID].map
                            }));
                        }
                }

                //host_reportはサーバー側からの要求に応じてクライアントから返って来る情報です。
                //このreportはユーザーが操作しないキャラクター動かすために送られてきます。
                //このゲームではAIキャラクターもユーザー側のデバイスで行動を計算しています。
                //裏でこっそり計算したAIキャラの行動をサーバーのデータに代入します。
                if (receive_message.type == "host_report")
                {
                    for (let i = 0; i < Data.room[receive_message.roomID].member.length; i++)
                    {
                        //AI操作になっているキャラクターだけを更新します。
                        if (Data.room[receive_message.roomID].member[i].controll == "auto")
                            Data.room[receive_message.roomID].member[i] = receive_message.info.member[i];
                    }

                    Data.room[receive_message.roomID].host = receive_message.socketID;

                }

                //discussion_callは緊急会議が招集されたときにやってきます。
                if (receive_message.type == "discussion_call")
                {

                    //他のメンバーに緊急会議があることを知らせます。
                    for (let i = 0; i < Data.client.length; i++)
                        if (Data.client[i].roomID == receive_message.roomID)
                        {
                            Data.client[i].state = "discussion";
                            Data.client[i].socket.send(JSON.stringify({
                                type: "discussion_request",
                                chair_man: receive_message.memberID
                            }));
                        }

                    Data.room[receive_message.roomID].state = "discussion";
                    //vote_arrayは誰が誰に投票したかということを知る大事な配列です。
                    //０〜８番まで配列があり、そこに誰が投票したかがカラー番号で入ってきます。
                    Data.room[receive_message.roomID].Discussion.vote_array = [
                        [],
                        [],
                        [],
                        [],
                        [],
                        [],
                        [],
                        [],
                        [],
                    ];
                    //追放するキャラを入れて各ユーザーへ渡す配列です。
                    //配列になっているのは、票が同数だったときに多キャラいれるためです。
                    Data.room[receive_message.roomID].Discussion.expel = [];
                }

                //discussion_commentは会議中のコメント入力があったときに送られてきます。
                //入力されたコメントを部屋の全員へ送っています。
                if (receive_message.type == "discussion_comment")
                {
                    for (let i = 0; i < Data.client.length; i++)
                        if (Data.client[i].roomID == receive_message.roomID)
                        {
                            Data.client[i].socket.send(JSON.stringify({
                                type: "discussion_comment",
                                memberID: receive_message.memberID,
                                comment: receive_message.comment
                            }));
                        }
                }

                //nominateはユーザーが投票したときに送られてきます。
                //サーバー側のvote_arrayにどのキャラクタにどのキャラクタが投票したかを代入します。
                //ユーザー分の代入が終わったら誰かのデバイスへその結果を送信し、そちらでAIキャラの投票も加えたものを
                //再度送信してもらいます。
                //そうしてできた投票結果をユーザー全員に送信し、
                //全員が同じ処理を行います。
                if (receive_message.type == "nominate")
                {
                    //この部分で、receive_message.nameに投票される（追放候補）が入ってきて、
                    //receive_message.colorに投票したキャラが入ってきます。
                    Data.room[receive_message.roomID].Discussion.vote_array[receive_message.name].push(receive_message.color);

                    //「投票した」とstateを変えます。
                    //投票したことを他のユーザーに伝えます。
                    //あとでユーザー全員が「投票した」となったらAIキャラ投票に移ります。                                                         
                    Data.client[receive_message.socketID].state = "voted";
                    for (let i = 0; i < Data.client.length; i++)
                        if (Data.client[i].roomID == receive_message.roomID)
                        {
                            Data.client[i].socket.send(JSON.stringify({
                                type: "voted",
                                color: receive_message.color
                            }));
                        }
                }

                //ai_voteResultはAIキャラの投票をユーザーの誰かが処理したあとの
                //結果が送られてきたことを通知します。
                if (receive_message.type == "ai_voteResult")
                {
                    //vote_arrayに結果を代入します。
                    Data.room[receive_message.roomID].Discussion.vote_array = receive_message.result;
                    //expel(=追放するキャラ)に結果を代入します。
                    Data.room[receive_message.roomID].Discussion.expel = receive_message.expel;

                    //集計結果を各ユーザーに配布します。
                    for (let i = 0; i < Data.client.length; i++)
                        if (Data.client[i].roomID == receive_message.roomID)
                            if (Data.client[i].socket != null)
                            {
                                Data.client[i].socket.send(JSON.stringify({
                                    type: "collection",
                                    vote_array: receive_message.result,
                                    expel: receive_message.expel
                                }));
                            }
                    Data.room[receive_message.roomID].state = "collection";
                }

                //finish_discussionは追放が終わり、しかしインポスターがまだいる場合に
                //やってきます。
                //キャラクターたちを並べ直し、再度作業が開始できるようにします。
                if (receive_message.type == "finish_discussion")
                {
                    if (Data.room[receive_message.roomID].state == "collection")
                    {
                        //Data.roomのmember配列を代入し直します。
                        //キャラクターを配置し直しているわけです。
                        for (let i = 0; i < Data.room[receive_message.roomID].member.length; i++)
                            Data.room[receive_message.roomID].member[i] = receive_message.member[i];

                        //全員に議論が終わったことを通知します。                            
                        for (let i = 0; i < Data.client.length; i++)
                            if (Data.client[i].roomID == receive_message.roomID)
                            {
                                Data.client[i].socket.send(JSON.stringify({
                                    type: "finish_discussion",
                                }));
                                Data.client[i].state = "work";
                            }

                        Data.room[receive_message.roomID].state = "work";
                    }
                }

                //game_setはクルー・インポスターのどちらかが勝利条件を達成すると
                //送られてきます。
                //サーバー側としてはゲームセットしたことと、どちらが勝ったのか、どうやって勝ったのかを
                //送信し返します。
                if (receive_message.type == "game_set")
                {

                    for (let i = 0; i < Data.client.length; i++)
                        if (Data.client[i].roomID == receive_message.roomID)
                        {
                            Data.client[i].socket.send(JSON.stringify({
                                type: "game_set",
                                //receive_message.result_checkに勝利した側と理由がのっています。
                                result_check: receive_message.result_check
                            }));
                            Data.client[i].state = "result";
                        }
                    Data.room[receive_message.roomID].state == "game_set";


                    //この命令を送ったあと、部屋は解散となるのでここでサーバー側のデータをリセットします。
                    Data.room_reset(receive_message.roomID);
                    for (let i = 0; i < 8; i++)
                        Data.member_reset(receive_message.roomID, i);
                }

                //勝敗がついたあとユーザーから送られてくる要求です。
                //サーバー側のクライアント情報をリセットして次のゲームができるようにしています。
                if (receive_message.type == "reset")
                {
                    Data.client[receive_message.socketID].state = "selectRoom";
                    Data.client[receive_message.socketID].roomID = null;
                    Data.client[receive_message.socketID].memberID = null

                    Data.room_reset(receive_message.roomID);
                }

                //キルされた、つまり殺されたときにみんなに送信する部分です。               
                if (receive_message.type == "kill")
                {
                    for (let i = 0; i < Data.client.length; i++)
                        if (Data.client[i].roomID == receive_message.roomID)
                        {
                            Data.client[i].socket.send(JSON.stringify({
                                type: "kill",
                                person: receive_message.person
                            }));
                        }
            //        Data.room[receive_message.roomID].member[receive_message.person].life = "murdered";
                }

                //妨害があったときにやってくる要求です。
                //なんの妨害がされたのか、その解除方法がある（暗闇・酸欠）には解除パターンも配布します。
                if (receive_message.type == "disturb")
                {
                    for (let i = 0; i < Data.client.length; i++)
                        if (Data.client[i].roomID == receive_message.roomID)
                        {
                            Data.client[i].socket.send(JSON.stringify({
                                type: "disturb",
                                disturb: receive_message.disturb,
                                solution: receive_message.solution
                            }));

                        }
                }

                //解除画面の変更についてです。
                //誰かがボタン・レバーを操作したらそれをみんなに伝えています。
                if (receive_message.type == "manipulate_changes")
                {
                    for (let i = 0; i < Data.client.length; i++)
                        if (Data.client[i].roomID == receive_message.roomID)
                        {
                            Data.client[i].socket.send(JSON.stringify({
                                type: "manipulate_changes",
                                //numberが変更したものの番号を表しています。       
                                number: receive_message.number,
                                memberID: receive_message.memberID,
                                //pitchは０か１が入っています。                                
                                pitch: receive_message.pitch
                            }));
                        }
                }

                //タスクをこなすと飛んできます。
                //みんなにタスクが一つ完了したことを知らせ、誰が完了させたかを知らせています。
                if (receive_message.type == "task_achieve")
                {
                    for (let i = 0; i < Data.client.length; i++)
                        if (Data.client[i].roomID == receive_message.roomID)
                        {
                            Data.client[i].socket.send(JSON.stringify({
                                type: "task_achieve",
                                memberID: receive_message.memberID
                            }));
                        }
                }

            });
        });

        //開発用と実践用の２つのportを用意しています。
        //実践用はprocess.env.PORTというのを使うそうです。
        //2000は私が作っていたときに使っていたポートです。
        const port = process.env.PORT || 2000;

        //websocketを始めます。
        http.listen(port);

        //無事始まったらこれがコンソール上に表示されます。
        //これがないと暗い画面のままで始まったかどうかわからなかったのでつけました。
        console.log("sever start");
    }

    //ここからがループ関数です。
    //javascriptであるようにrequestAnimationFrameがないのでsetIntervalで作っています。
    //ループ関数に入っているものは、サーバー側で状態を監視し、必要な条件が揃ったときに
    //発動するものです。
    static loop()
    {

        setInterval(() => {

            let connections = -1;
            let room_connections = [-1, -1, -1];

            //クライアントの状態によってプッシュ通信するものを変えています。
            for (let i = 0; i < Data.client.length; i++)
            {
                //セレクトルームにいるときは同時接続数・ルーム内の人数をカウントして
                //常に送信しています。
                //クライアント側は接続者が増減したりルームに入ったりすると
                //リアルタイムにそれが変化するはずです。
                if (Data.client[i].state == "selectRoom")
                {
                    //今回のsetIntervalでまだ誰も数を数えていないなら
                    if (connections == -1)
                    {

                        //同時接続者数・ルーム内の人数を数えます。                        
                        let a = 0;
                        let b = [0, 0, 0];
                        for (let i = 0; i < Data.client.length; i++)
                            if (Data.client[i].socket != null)
                                a++;
                        for (let i = 0; i < Data.room.length; i++)
                        {
                            for (let j = 0; j < Data.room[i].member.length; j++)
                                if (Data.room[i].member[j].color != null)
                                    b[i]++;
                        }

                        connections = a;
                        room_connections = b;

                    }

                    //セレクトルームにいる接続者全員にそれを伝えます。
                    Data.client[i].socket.send(JSON.stringify({
                        type: "selectRoom_info",
                        client_number: connections,
                        room_number: room_connections,
                        state: [Data.room[0].state, Data.room[1].state, Data.room[2].state]
                    }));
                }

                //待合室にいるクライアントには
                if (Data.client[i].state == "waitRoom")
                {
                    //待合室にいる人の情報を伝えます。
                    Data.client[i].socket.send(JSON.stringify({
                        type: "waitRoom_info",
                        member: Data.room[Data.client[i].roomID].member
                    }));
                }

                //作業中にときも待合室と同じです。

                if (Data.client[i].state == "work")
                {
                    if (i != Data.room[Data.client[i].roomID].host)
                    {
                        Data.client[i].socket.send(JSON.stringify({
                            type: "room_info",
                            room_info: Data.room[Data.client[i].roomID]
                        }));
                    }

                }
            }

            //部屋ごとのプッシュ通信です。
            for (let i = 0; i < Data.room.length; i++)
            {
                if (Data.room[i].state == "ready_start")
                {
                    let check = true;
                    for (let j = 0; j < Data.client.length; j++)
                        if (Data.client[j].socket != null)
                            if (Data.client[j].roomID == i)
                            {
                                if (Data.client[j].state != "ready_start")
                                    check = false;
                            }


                    if (check)
                    {
                        for (let j = 0; j < Data.client.length; j++)
                            if (Data.client[j].roomID == i)
                            {
                                Data.client[j].state = "work";
                                Data.client[j].socket.send(JSON.stringify({
                                    type: "countdown_start"
                                }));
                            }

                        Data.room[i].state = "work";
                    }
                }

                //作業中のときは、
                if (Data.room[i].state == "work")
                {
                    //だれかにrequest_hostを送ります。
                    //これをおくると送られたユーザーはAIキャラの行動を裏で計算して
                    //それをまたサーバーに送ってくれます。
                    //これを1/60秒のスピードで続けることでAIキャラが自動で動いているように見えるのです。
                    let check = true;
                    for (let j = 0; j < Data.client.length; j++)
                        if (check)
                            if (Data.client[j].roomID == i)
                                if (Data.client[j].socket != null)
                                {
                                    Data.client[j].socket.send(JSON.stringify({
                                        type: "request_host",
                                    }));
                                    //1人のユーザーが調べてくれればよいので
                                    //このフレームでは次は計算しない
                                    check = false;
                                }

                    //もしだれもユーザーがいないなら
                    //その部屋は解散して次を待てるようにします。
                    if (check)
                        Data.room_reset(Data.client[i].roomID);
                }

                //会議が開かれているときは
                if (Data.room[i].state == "discussion")
                {
                    let check = true;
                    for (let j = 0; j < Data.client.length; j++)
                        if (i == Data.client[j].roomID)
                            if (Data.room[i].member[Data.client[j].memberID].controll != "auto")
                            {
                                //全員が投票したかどうかを調べます。
                                if (Data.client[j].life == "connect")
                                    if (Data.room[i].member[Data.client[j].memberID].life == "alive")
                                        if (Data.client[j].state != "voted")
                                            check = false;
                            }

                    //投票が完了していたら
                    if (check)
                    {
                        let check2 = true;
                        for (let j = 0; j < Data.client.length; j++)
                            if (check2)
                                if (Data.client[j].socket != null)
                                {
                                    //AIキャラの投票を誰かにしてもらいます。
                                    Data.client[j].socket.send(JSON.stringify({
                                        type: "ai_vote",
                                        vote_array: Data.room[i].Discussion.vote_array
                                    }));
                                    //誰か一人見つかればいいのでそれ以降はキャンセル                                    
                                    check2 = false;
                                }
                        //誰もいないなら解散
                        if (check2)
                            Data.room_reset(i);
                    }
                }
            }

            //ライブチェックはクライアントがいるかどうかを調べる命令をまとめたものです。
            this.live_check();
        }, 16);
    }

    //ライブチェック関数です。pingpong通信が途切れたときの処理を書いています。
    static live_check()
    {
        for (let i = 0; i < Data.client.length; i++)
            if (Data.client[i].socket != null)
            {
                //サーバー側からしつこくpingを送ります。
                //そのたびに値を1つずつ増やしていきます。
                Data.client[i].ping++;
                Data.client[i].socket.send(JSON.stringify({
                    type: "ping"
                }));
            }


        for (let i = 0; i < Data.client.length; i++)
        {
            //60回呼んでも応答がないとき（約1秒くらい？）
            if (Data.client[i].life != "vacant")
                if (Data.client[i].socket != null)
                    if (Data.client[i].ping > 60)
                    {
                        //このクライアントは切断されていると判断します。
                        Data.client[i].life = "disconnect";

                        for (let j = 0; j < Data.client.length; j++)
                            if (i != j)
                            {
                                //部屋に入っているクライアントだったときはその部屋全員に切断したことを伝えます。
                                if (Data.client[j].socket != null)
                                    if (Data.client[i].roomID == Data.client[j].roomID)
                                    {
                                        Data.client[j].socket.send(JSON.stringify({
                                            type: "lost_member",
                                            memberID: Data.client[i].memberID
                                        }));
                                    }
                            }

                        //このキャラは死んだことにします。
                        if (Data.client[i].memberID != null)
                            Data.room[Data.client[i].roomID].member[Data.client[i].memberID].life = "none";
                    }
        }

        //部屋側からも中に人がいるかどうか調べます。        
        for (let i = 0; i < Data.room.length; i++)
        {
            let check = true;
            for (let j = 0; j < Data.client.length; j++)
                if (Data.client[j].socket != null)
                    if (Data.client[j].roomID == i)
                        check = false;
            //クライアント全員を調べ、ルーム内に誰もいなければ
            //部屋全体をリセットします。
            if (check)
                Data.room_reset(i);
        }

        //クライアントが切断されているときには
        //ソケットを閉めてクライアントデータをリセットします。
        //次の誰かが使えるようにしています。
        for (let i = 0; i < Data.client.length; i++)
            if (Data.client[i].life == "disconnect")
            {
                Data.client[i].socket.close();
                Data.client_reset(i);
            }
    }
}


//これらの命令を実行に移します。
Data.init();
Launcher.start();
Launcher.loop();
