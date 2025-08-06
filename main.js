

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
        this.client[i] = {
            socket: null,
            ping: 0,
            state: null,
            roomID: null,
            memberID: null,
        };
    }

    static room_reset(i)
    {
        this.room[i] = {
            map: 0,
            host: -1,
            member: [],
            state: "idle",
            charactor_state: "peace",
            Machine: {
                achieve: 0,
                disturb_device: []

            },
            Imposter: {
                disturb: "none",
                solution: [],
                oxygen_time: null,
            },
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
            },
            aim: [],
        };
        for (let j = 0; j < 8; j++)
            this.member_reset(i, j);

        for (let j = 0; j < 9; j++)
            Data.room[i].Machine.disturb_device[j] = 0;
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
            role: "clue",
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
        //通信をwebsocket用にアップグレードする時を捕まえる関数
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
        websocket.on("connection", (connect_socket) => {

            let check = true;
            for (let i = 0; i < Data.client.length; i++)
                if (Data.client[i].socket == null)
                {
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

            if (check)
            {
                connect_socket.send(JSON.stringify({
                    type: "client_full"
                }));
            }

            connect_socket.on("message", (message_data) => {

                let receive_message = JSON.parse(message_data);
                if (receive_message.type == "pong")
                    Data.client[receive_message.ID].ping = 0;
                if (receive_message.type == "gotoWaitRoom")
                {
                    let a = -1;
                    let b = -1;
                    while (true)
                    {
                        a = Math.floor(Math.random() * 8);
                        if (Data.room[receive_message.room].member[a].color == null)
                        {
                            Data.room[receive_message.room].member[a].color = "reserved";
                            break;
                        }
                    }

                    while (true)
                    {
                        b = Math.floor(Math.random() * 8);
                        let c = true;
                        for (let j = 0; j < 8; j++)
                            if (Data.room[receive_message.room].member[j].color == b)
                                c = false;
                        if (c)
                            break;
                    }

                    Data.client[receive_message.socketID].state = "waitRoom";
                    Data.client[receive_message.socketID].roomID = receive_message.room;
                    Data.client[receive_message.socketID].memberID = a;
                    Data.room[receive_message.room].member[a].color = b;
                    Data.room[receive_message.room].member[a].x = 4 * 64;
                    Data.room[receive_message.room].member[a].y = 7 * 64;
                    Data.room[receive_message.room].member[a].direct = 0;
                    Data.room[receive_message.room].member[a].pose = 1;
                    Data.room[receive_message.room].member[a].controll = "manual";
                    connect_socket.send(JSON.stringify({
                        type: "reply_gotoWaitRoom",
                        roomID: receive_message.room,
                        memberID: a,
                        roomMember: Data.room[receive_message.room].member
                    }));
                }

                if (receive_message.type == "gotoSelectRoom")
                {
                    Data.client[receive_message.socketID].state = "selectRoom";
                    Data.member_reset(receive_message.roomID, receive_message.memberID);
                }


                if (receive_message.type == "pos_send")
                {
                    Data.room[receive_message.roomID].member[receive_message.memberID].x = receive_message.info.x;
                    Data.room[receive_message.roomID].member[receive_message.memberID].y = receive_message.info.y;
                    Data.room[receive_message.roomID].member[receive_message.memberID].life = receive_message.info.life;
                    Data.room[receive_message.roomID].member[receive_message.memberID].direct = receive_message.info.direct;
                    Data.room[receive_message.roomID].member[receive_message.memberID].pose = receive_message.info.pose;
                }


                if (receive_message.type == "chat")
                {
                    for (let i = 0; i < Data.client.length; i++)
                    {
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
                        if (Data.client[i].state == "discussion")
                            if (receive_message.roomID == Data.client[i].roomID)
                                if (receive_message.memberID != Data.client[i].memberID)
                                {
                                    Data.client[i].socket.send(JSON.stringify({
                                        type: "discussion_info",
                                        memberID: receive_message.memberID,
                                        message: receive_message.message
                                    }));
                                }
                    }
                }

                if (receive_message.type == "ready_start")
                {
                    Data.client[receive_message.socketID].state = "ready_start";
                    let check = true;
                    for (let i = 0; i < Data.client.length; i++)
                        if (Data.client[i].roomID == receive_message.roomID)
                        {
                            if (Data.client[i].state != "ready_start")
                                check = false;
                        }

                    if (check)
                    {
                        for (let i = 0; i < Data.client.length; i++)
                            if (Data.client[i].roomID == receive_message.roomID)
                            {
                                Data.client[i].state = "work";
                                Data.client[i].socket.send(JSON.stringify({
                                    type: "countdown_start"
                                }));
                            }
                    }

                }

                if (receive_message.type == "host_call")
                {
                    Data.room[receive_message.roomID].state = "work";
                    Data.room[receive_message.roomID].map = receive_message.map;
                    Data.room[receive_message.roomID].host = receive_message.socketID;
                    for (let i = 0; i < Data.room[receive_message.roomID].member.length; i++)
                    {
                        Data.room[receive_message.roomID].member[i].x = receive_message.pos[i].x;
                        Data.room[receive_message.roomID].member[i].y = receive_message.pos[i].y;
                        Data.room[receive_message.roomID].member[i].direct = receive_message.pos[i].direct;
                        Data.room[receive_message.roomID].member[i].pose = receive_message.pos[i].pose;
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


                    let c = Math.floor(Math.random() * 8);
                    Data.room[receive_message.roomID].member[c].role = "imposter";


                /*    for (let i = 0; i < Data.client.length; i++)
                        if (Data.room[receive_message.roomID].host == i)
                            Data.room[receive_message.roomID].member[Data.client[i].memberID].role = "imposter";
*/

                    for (let i = 0; i < Data.client.length; i++)
                        if (Data.client[i].roomID == receive_message.roomID)
                        {
                            Data.client[i].state = "countdown";
                            Data.client[i].socket.send(JSON.stringify({
                                type: "work_init",
                                member: Data.room[receive_message.roomID].member,
                                map: Data.room[receive_message.roomID].map
                            }));
                        }
                }


                if (receive_message.type == "host_report")
                {
                    for (let i = 0; i < Data.room[receive_message.roomID].member.length; i++)
                    {
                        if (Data.room[receive_message.roomID].member[i].controll == "auto")
                            Data.room[receive_message.roomID].member[i] = receive_message.info.member[i];
                        if (i == receive_message.memberID)
                            Data.room[receive_message.roomID].member[i] = receive_message.info.member[i];
                    }
                }


                if (receive_message.type == "discussion_call")
                {
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
                    Data.room[receive_message.roomID].Discussion.expel = [];
                }

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

                if (receive_message.type == "nominate")
                {
                    Data.room[receive_message.roomID].Discussion.vote_array[receive_message.name].push(receive_message.color);
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

                if (receive_message.type == "ai_voteResult")
                {
                    Data.room[receive_message.roomID].Discussion.vote_array = receive_message.result;
                    Data.room[receive_message.roomID].Discussion.expel = receive_message.expel;


                    for (let i = 0; i < Data.client.length; i++)
                        if (Data.client[i].roomID == receive_message.roomID)
                        {
                            Data.client[i].socket.send(JSON.stringify({
                                type: "collection",
                                vote_array: receive_message.result,
                                expel: receive_message.expel
                            }));
                        }

                    Data.room[receive_message.roomID].state = "collection";
                }

                if (receive_message.type == "finish_discussion")
                {
                    for (let i = 0; i < Data.room[receive_message.roomID].member.length; i++)
                        Data.room[receive_message.roomID].member[i] = receive_message.member[i];

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

                if (receive_message.type == "game_set")
                {
                    for (let i = 0; i < Data.client.length; i++)
                        if (Data.client[i].roomID == receive_message.roomID)
                        {
                            Data.client[i].socket.send(JSON.stringify({
                                type: "game_set",
                                result_check: receive_message.result_check
                            }));
                            Data.client[i].state = "result";
                        }

                    Data.room_reset(receive_message.roomID);
                    for (let i = 0; i < 8; i++)
                        Data.member_reset(receive_message.roomID, i);
                }

                if (receive_message.type == "reset")
                {
                    Data.client[receive_message.socketID].state = "selectRoom";
                    Data.client[receive_message.socketID].roomID = null;
                    Data.client[receive_message.socketID].memberID = null

                    Data.room_reset(receive_message.roomID);
                }

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
                    Data.room[receive_message.roomID].member[receive_message.person].life = "murdered";
                }

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


                if (receive_message.type == "manipulate_changes")
                {
                    for (let i = 0; i < Data.client.length; i++)
                        if (Data.client[i].roomID == receive_message.roomID)
                        {
                            Data.client[i].socket.send(JSON.stringify({
                                type: "manipulate_changes",
                                number: receive_message.number,
                                memberID: receive_message.memberID,
                                pitch: receive_message.pitch
                            }));
                        }
                }

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
        http.listen(2000);
        console.log("sever start");
    }

    static loop()
    {
        setInterval(() => {

            let connections = -1;
            let room_connections = [-1, -1, -1];
            for (let i = 0; i < Data.client.length; i++)
            {
                if (Data.client[i].state == "selectRoom")
                {
                    if (connections == -1)
                    {
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

                    Data.client[i].socket.send(JSON.stringify({
                        type: "selectRoom_info",
                        client_number: connections,
                        room_number: room_connections,
                        state: [Data.room[0].state, Data.room[1].state, Data.room[2].state]
                    }));
                }

                if (Data.client[i].state == "waitRoom")
                {
                    Data.client[i].socket.send(JSON.stringify({
                        type: "waitRoom_info",
                        member: Data.room[Data.client[i].roomID].member
                    }));
                }

                if (Data.client[i].state == "work")
                {
                    Data.client[i].socket.send(JSON.stringify({
                        type: "room_info",
                        room_info: Data.room[Data.client[i].roomID]
                    }));
                }
            }

            for (let i = 0; i < Data.room.length; i++)
            {
                if (Data.room[i].state == "discussion")
                {
                    let check = true;
                    for (let j = 0; j < Data.client.length; j++)
                        if (i == Data.client[j].roomID)
                            if (Data.room[i].member[Data.client[j].memberID].controll != "auto")
                            {
                                if (Data.room[i].member[Data.client[j].memberID].life == "alive")
                                    if (Data.client[j].state != "voted")
                                        check = false;
                            }

                    if (check)
                    {
                        Data.client[Data.room[i].host].socket.send(JSON.stringify({
                            type: "ai_vote",
                            vote_array: Data.room[i].Discussion.vote_array
                        }));
                    }
                }
            }

            this.live_check();
        }, 16);
    }

    static live_check()
    {
        for (let i = 0; i < Data.client.length; i++)
            if (Data.client[i].socket != null)
            {
                Data.client[i].ping++;
                Data.client[i].socket.send(JSON.stringify({
                    type: "ping"
                }));
            }


        for (let i = 0; i < Data.client.length; i++)
        {
            if (Data.client[i].socket != null)
                if (Data.client[i].ping > 60)                
                    Data.client[i].state = "expire";         
        }



        for (let i = 0; i < Data.client.length; i++)
            if (Data.client[i].state == "expire")
            {
                for (let j = 0; j < Data.client.length; j++)
                    if (i != j)
                    {
                        if (Data.client[j].socket != null)
                            if (Data.client[i].roomID == Data.client[j].roomID)
                            {
                                Data.client[j].socket.send(JSON.stringify({
                                    type: "lost_member",
                                    memberID: Data.client[i].memberID
                                }));
                            }
                    }

                if (Data.client[i].memberID != null)
                    Data.member_reset(Data.client[i].roomID, Data.client[i].memberID);

                Data.client[i].state = "expire2";
            }


        for (let i = 0; i < Data.client.length; i++)
            if (Data.client[i].state == "expire2")
            {
                if (Data.client[i].roomID != null)
                    if (Data.room[Data.client[i].roomID].host != -1)
                        if (i == Data.room[Data.client[i].roomID].host)
                        {
                            let check = true;
                            for (let j = 0; j < Data.client.length; j++)
                                if (check)
                                    if (i != j)
                                    {
                                        if (Data.client[i].roomID == Data.client[j].roomID)
                                        {
                                            Data.host = j;
                                            Data.client[j].socket.send(JSON.stringify({
                                                type: "request_host",
                                            }));
                                            check = false;
                                        }
                                    }

                            if (check)
                                Data.room_reset(Data.client[i].roomID);
                        }

                Data.client[i].socket.close();
                Data.client_reset(i);
            }


        for (let i = 0; i < Data.room.length; i++)
        {
            let check = true;
            for (let j = 0; j < Data.client.length; j++)
                if (Data.client[j].socket != null)
                    if (Data.client[j].roomID == i)
                        check = false;
            if (check)
                Data.room_reset(i);
        }
    }
}


Data.init();
Launcher.start();
Launcher.loop();
