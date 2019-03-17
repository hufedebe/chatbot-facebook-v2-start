'use strict';

const dialogflow = require('dialogflow');
const config = require('./configTest');
const express = require('express');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const request = require('request');
const app = express();
const uuid = require('uuid');
const requestP = require('request-promise');

// Messenger API parameters
if (!config.FB_PAGE_TOKEN) {
	throw new Error('missing FB_PAGE_TOKEN');
}
if (!config.FB_VERIFY_TOKEN) {
	throw new Error('missing FB_VERIFY_TOKEN');
}
if (!config.GOOGLE_PROJECT_ID) {
	throw new Error('missing GOOGLE_PROJECT_ID');
}
if (!config.DF_LANGUAGE_CODE) {
	throw new Error('missing DF_LANGUAGE_CODE');
}
if (!config.GOOGLE_CLIENT_EMAIL) {
	throw new Error('missing GOOGLE_CLIENT_EMAIL');
}
if (!config.GOOGLE_PRIVATE_KEY) {
	throw new Error('missing GOOGLE_PRIVATE_KEY');
}
if (!config.FB_APP_SECRET) {
	throw new Error('missing FB_APP_SECRET');
}
if (!config.SERVER_URL) { //used for ink to static files
	throw new Error('missing SERVER_URL');
}



app.set('port', (process.env.PORT || 5000))

//verify request came from facebook
app.use(bodyParser.json({
	verify: verifyRequestSignature
}));

//serve static files in the public directory
app.use(express.static('public'));

// Process application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({
	extended: false
}));

// Process application/json
app.use(bodyParser.json());






const credentials = {
    client_email: config.GOOGLE_CLIENT_EMAIL,
    private_key: config.GOOGLE_PRIVATE_KEY,
};

const sessionClient = new dialogflow.SessionsClient(
	{
		projectId: config.GOOGLE_PROJECT_ID,
		credentials
	}
);


const sessionIds = new Map();

// Index route
app.get('/', function (req, res) {
	res.send('Hello world, I am a chat bot')
})

// for Facebook verification
app.get('/webhook/', function (req, res) {
	console.log("request");
	if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === config.FB_VERIFY_TOKEN) {
		res.status(200).send(req.query['hub.challenge']);
	} else {
		console.error("Failed validation. Make sure the validation tokens match.");
		res.sendStatus(403);
	}
})

/*
 * All callbacks for Messenger are POST-ed. They will be sent to the same
 * webhook. Be sure to subscribe your app to your page to receive callbacks
 * for your page. 
 * https://developers.facebook.com/docs/messenger-platform/product-overview/setup#subscribe_app
 *
 */
app.post('/webhook/', function (req, res) {
	var data = req.body;
	//console.log(JSON.stringify(data));



	// Make sure this is a page subscription
	if (data.object == 'page') {
		// Iterate over each entry
		// There may be multiple if batched
		data.entry.forEach(function (pageEntry) {
			var pageID = pageEntry.id;
			var timeOfEvent = pageEntry.time;

			// Iterate over each messaging event
			pageEntry.messaging.forEach(function (messagingEvent) {
				if (messagingEvent.optin) {
					receivedAuthentication(messagingEvent);
				} else if (messagingEvent.message) {
					receivedMessage(messagingEvent);
				} else if (messagingEvent.delivery) {
					receivedDeliveryConfirmation(messagingEvent);
				} else if (messagingEvent.postback) {
					receivedPostback(messagingEvent);
				} else if (messagingEvent.read) {
					receivedMessageRead(messagingEvent);
				} else if (messagingEvent.account_linking) {
					receivedAccountLink(messagingEvent);
				} else {
					console.log("Webhook received unknown messagingEvent: ", messagingEvent);
				}
			});
		});

		// Assume all went well.
		// You must send back a 200, within 20 seconds
		res.sendStatus(200);
	}
});





function receivedMessage(event) {

	var senderID = event.sender.id;
	var recipientID = event.recipient.id;
	var timeOfMessage = event.timestamp;
	var message = event.message;

	if (!sessionIds.has(senderID)) {
		sessionIds.set(senderID, uuid.v1());
	}
	//console.log("Received message for user %d and page %d at %d with message:", senderID, recipientID, timeOfMessage);
	//console.log(JSON.stringify(message));

	var isEcho = message.is_echo;
	var messageId = message.mid;
	var appId = message.app_id;
	var metadata = message.metadata;

	// You may get a text or attachment but not both
	var messageText = message.text;
	var messageAttachments = message.attachments;
	var quickReply = message.quick_reply;

	console.log("receivedMessage",message);

	
	if (isEcho) {
		handleEcho(messageId, appId, metadata);
		return;
	} else if (quickReply) {
		if( quickReply.payload=='type_bars'){
			handleQuickReplyBars(senderID, message, messageId);
		}else if(quickReply.payload=='list_cocktails'){
			handleQuickReplyDrink(senderID,message,messageId);
			console.log('QuickReply-list_cocktails ');
		}else{
			handleQuickReply(senderID, quickReply, messageId);
		}
	
		return;
	}


	if (messageText) {
		//send message to api.ai
		sendToDialogFlow(senderID, messageText);
	} else if (messageAttachments) {
		handleMessageAttachments(messageAttachments, senderID);
	}
}


/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message. 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
 * 
 */
function receivedPostback(event) {
	var senderID = event.sender.id;
	var recipientID = event.recipient.id;
	var timeOfPostback = event.timestamp;

	// The 'payload' param is a developer-defined field which is set in a postback 
	// button for Structured Messages. 
	var payload = event.postback.payload;
	//console.log("payload",payload);
	switch (payload) {
		case 'FACEBOOK_WELCOME':
			 //greetUserText(senderID); 
			 if (!sessionIds.has(senderID)) {
				sessionIds.set(senderID, uuid.v1());
			 }
			 sendToDialogFlow(senderID, "Hello");
			 break;
		case 'beverages':
			if (!sessionIds.has(senderID)) {
				sessionIds.set(senderID, uuid.v1());
			}
			sendToDialogFlow(senderID, "beverages");
			break;
		case 'bars':
			if (!sessionIds.has(senderID)) {
				sessionIds.set(senderID, uuid.v1());
			}
			
			sendToDialogFlow(senderID, "bars");
			break;

		case 'find':
			if (!sessionIds.has(senderID)) {
				sessionIds.set(senderID, uuid.v1());
			}
			console.log("Entrando al find us");
			sendToDialogFlow(senderID, "find");
			break;

		case 'drinks':	
				if (!sessionIds.has(senderID)) {
					sessionIds.set(senderID, uuid.v1());
				}
				sendToDialogFlow(senderID, "drinks");
				sendOptionsDrinks(senderID);
				break;
		case 'list_cocktails':
				if (!sessionIds.has(senderID)) {
					sessionIds.set(senderID, uuid.v1());
				}
				console.log("hugo_test",payload.text);
				//sendToDialogFlow(senderID, "drinks");
				const optionDrinkBars ={
					method: 'GET',
					uri: 'http://aify-test.herokuapp.com/api/v1/drink_base/?drink_type=Cocktails',
					
					}
					sendTypingOn(senderID);

					requestP(optionDrinkBars).then(apiRes=>{
							var response = JSON.parse(apiRes);
							//console.log(response);
							var count = response.length;
						//	let results = response.results;
							sendTypingOff(senderID);
							sendTextMessage(senderID,"Got it Found 30 different drinks in "+ count +" bars");
							//sendListRecomendation(sender,results);
					});	


				break;
				//sendOptionsDrinks(senderID);
		case 'type_bars':
				console.log('type_bars');
				console.log(event);
				break;

		default:
			//unindentified payload
			console.log(payload);
			sendToDialogFlow(senderID, payload);
			//sendTextMessage(senderID, "I'm not sure what you want. Can you be more specific?");
			break;

	}

	console.log("Received postback for user %d and page %d with payload '%s' " +
		"at %d", senderID, recipientID, payload, timeOfPostback);

}



function handleMessageAttachments(messageAttachments, senderID){
	//for now just reply
	//sendTextMessage(senderID, "Attachment received. Thank you.");	
	console.log("Entrando Ubicacion");
	console.log(messageAttachments[0].payload.coordinates);
	/*
	var ubicacion =" lat: "+  messageAttachments[0].payload.coordinates.lat+", long: "+messageAttachments[0].payload.coordinates.long;*/
	sendToDialogFlow(senderID, "lat: "+ messageAttachments[0].payload.coordinates.lat +" long: "+messageAttachments[0].payload.coordinates.long);
	//sendToDialogFlow(senderID,JSON.stringify(messageAttachments[0].payload.coordinates));
}

function handleQuickReplyBars(senderID, meessage,messageID){
	//var quickReplyPayload = quickReply.payload;
	//console.log("Quick reply for message %s with payload %s", messageId, quickReplyPayload);
	//send payload to api.ai
	//sendToDialogFlow(senderID, quickReplyPayload);
	console.log("Entrando al quickReply de TypeBars");
	var optionGetIdBar={
		method: 'GET',
		uri: 'http://aify-test.herokuapp.com/api/v1/listing/?name_search='+meessage.text

	}

	requestP(optionGetIdBar).then(fbRes=>{
			var barInformation = JSON.parse(fbRes);
			sendToDialogFlow(senderID, barInformation.results[0].id);

	});



}


function handleQuickReplyDrink(senderID, meessage,messageID){

	var optionGetIdDrink={
		method: 'GET',
		uri: 'http://aify-test.herokuapp.com/api/v1/drink_base/?drink_type='+meessage.text
	}

	requestP(optionGetIdDrink).then(fbRes=>{
			var response = JSON.parse(fbRes);
			//sendToDialogFlow(senderID, barInformation.results[0].id);
			let arrayDrinks = []
			for(var i=0 ; i<4;i++){

					var tempOption={
						"title": response[i].name,
						"image_url":"http://pngimg.com/uploads/beer/beer_PNG2369.png",
						"subtitle": response[i].ingredients,
						"buttons": [
							{
							"type": "postback",
							"payload": response[i].id,
							"title": "Ingredients"
							}
						],
							"default_action": {
									"type": "web_url",
									"url": "https://tardigrd.com/",
									"webview_height_ratio": "tall"
							}
					}

					arrayDrinks.push(tempOption);

			}


			var messageData = {
				recipient: {
					id: senderID
				},
				message:{
					attachment: {
						type: "template",
						"payload": {
							"template_type": "list",
							"top_element_style": "compact",
							"elements": arrayDrinks
							}
					}
				}}

				callSendAPI(messageData);
	});



}


function handleQuickReply(senderID, quickReply, messageId) {
	var quickReplyPayload = quickReply.payload;
	console.log("Quick reply for message %s with payload %s", messageId, quickReplyPayload);
	//send payload to api.ai
	sendToDialogFlow(senderID, quickReplyPayload);
}

//https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-echo
function handleEcho(messageId, appId, metadata) {
	// Just logging message echoes to console
	console.log("Received echo for message %s and app %d with metadata %s", messageId, appId, metadata);
}

function handleDialogFlowAction(sender, action, messages, contexts, parameters) {
	

	switch(action){
		case 'get-username':
				let messageReceive= messages;
				let flag = false;
			
				const optionGetUser ={
					method: 'GET',
					uri: 'https://graph.facebook.com/v3.2/' + sender,
					qs: {
						access_token: config.FB_PAGE_TOKEN
					}
				}

				requestP(optionGetUser).then(fbRes=>{
						var user = JSON.parse(fbRes);
						if (user.first_name) {
							console.log("Apunto de enviar a handleMessageInit");
							handleMessageInit(messageReceive, user.id, user.first_name);
							sendListInitOptions(sender);
							//	sendTextMessage(user.id, "Hi " + user.first_name + '!');
						} else {
							handleMessageInit(messageReceive, user.id, "Usuario Desconocido");
							sendListInitOptions(sender);
						}
				});

				break;

		case 'get-user-location':
			var text = "Please tell me where you are 👇  ?";
			var replies=[
				{
				  "content_type": "location"
				}
			  ];
			sendQuickReplyLocation(sender,text,replies);
			break;

		case 'show-menu':
			  
			  sendTextMessage(sender,"Good! now let me think");

			  const optionBar ={
				method: 'GET',
				uri: 'https://aify-test.herokuapp.com/search/restaurants_by_position/?latitude=48.85&longitude=2.35',
				
				}
				sendTypingOn(sender);
				requestP(optionBar).then(apiRes=>{
						var response = JSON.parse(apiRes);
						console.log(response);
						var count = response.count;
						let results = response.results;
						sendTypingOff(sender);
						sendTextMessage(sender,"Got it Found 30 different drinks in "+ count +" bars");
						sendListRecomendation(sender,results);
				});		
			break;
		case 'show-list-cocktails':
			
				const optionDrinkBars ={
					method: 'GET',
					uri: 'http://aify-test.herokuapp.com/api/v1/drink_base/?drink_type=Cocktails',
					
					}
					sendTypingOn(sender);

					requestP(optionDrinkBars).then(apiRes=>{
						var response = JSON.parse(apiRes);
						console.log(response.length);

						let arrayDrinks = []
						for(var i=0 ; i<4;i++){

								var tempOption={
									"title": response[i].name,
									"image_url":"http://pngimg.com/uploads/beer/beer_PNG2369.png",
									"subtitle": response[i].ingredients,
									"buttons": [
										{
										"type": "postback",
										"payload": "ingredients",
										"title": "Ingredients"
										}
									],
										"default_action": {
												"type": "web_url",
												"url": "https://tardigrd.com/",
												"webview_height_ratio": "tall"
										}
								}

								arrayDrinks.push(tempOption);

						}


						var messageData = {
							recipient: {
								id: sender
							},
							message:{
								attachment: {
									type: "template",
									"payload": {
										"template_type": "list",
										"top_element_style": "compact",
										"elements": arrayDrinks
										}
								}
							}}

							callSendAPI(messageData);
		
							//sendListRecomendation(sender,results);
					});	


				break;


		case 'type_of_bars':

					const optionDrinkBars2 ={
						method: 'GET',
						uri: 'http://aify-test.herokuapp.com/api/v1/listing/',
						
						}
						sendTypingOn(sender);

						requestP(optionDrinkBars2).then(apiRes=>{
								var response = JSON.parse(apiRes);
							
								sendTypingOff(sender);
								let arrayTypeBars = []
								for(var i=0 ; i<11;i++){
				
										var tempOption={
											"content_type":"text",
											"title":response.results[i].name,
											"payload": 'type_bars',
										}
				
										arrayTypeBars.push(tempOption);
				
								}
				
				
								var messageData = {
									recipient: {
										id: sender
									},
									message:{
										"text": "And what do you have in mind? (select from on the options or type it in)",
										"quick_replies":arrayTypeBars
									}}
				
									callSendAPI(messageData);
						});	



					break;
		case 'show_bars':
					console.log('show_bars', contexts[1].parameters);
					let idBar='';
					var latitud= contexts[1].parameters.fields.number.numberValue;
					var longitud= contexts[1].parameters.fields.number1.numberValue;
					idBar = contexts[1].parameters.fields.idBar.stringValue;
					//http://webview.tardigrd.com/?ids=40&plat=48.86&plon=2.36
					//http://webview.tardigrd.com/case_tags/?id_tag=42&id_tag=64&plat=48.86&plon=2.36 
					var messageData = {
						recipient: {
							id: sender
						},
						message:{
							attachment:{
								type :"template",
								payload:{
										template_type:"button",
										text: "Check our recommendations",
										buttons:[
											{	"type":"web_url",
												"url":"http://webview.tardigrd.com/case_tags/?id_tag="+idBar+"&plat="+latitud+"&plon="+longitud,
												"title":"See bars"
											}
										]
								}
							}
						}
					}
	
						callSendAPI(messageData);
			
					break;
		default:
			handleMessages(messages, sender);
			break;
	}


	
}



function handleMessageInit(messages, sender,user){

	
	let timeoutInterval = 1100;
    let previousType ;
    let cardTypes = [];
    let timeout = 0;
    for (var i = 0; i < messages.length; i++) {

        if ( previousType == "card" && (messages[i].message != "card" || i == messages.length - 1)) {
            timeout = (i - 1) * timeoutInterval;
            setTimeout(handleCardMessages.bind(null, cardTypes, sender), timeout);
            cardTypes = [];
            timeout = i * timeoutInterval;
            setTimeout(handleMessage.bind(null, messages[i], sender), timeout);
        } else if ( messages[i].message == "card" && i == messages.length - 1) {
            cardTypes.push(messages[i]);
            timeout = (i - 1) * timeoutInterval;
            setTimeout(handleCardMessages.bind(null, cardTypes, sender), timeout);
            cardTypes = [];
        } else if ( messages[i].message == "card") {
            cardTypes.push(messages[i]);
        } else  {

					timeout = i * timeoutInterval;
					messages[i].text.text[0]=messages[i].text.text[0].replace("UserName", user);
					console.log("Mensaje else",messages[i].text.text[0]);

            setTimeout(handleMessage.bind(null, messages[i], sender), timeout);
        }

        previousType = messages[i].message;

    }
}




function handleMessage(message, sender) {
    switch (message.message) {
        case "text": //text
            message.text.text.forEach((text) => {
                if (text !== '') {
                    sendTextMessage(sender, text);
                }
            });
            break;
        case "quickReplies": //quick replies
            let replies = [];
            message.quickReplies.quickReplies.forEach((text) => {
                let reply =
                    {
                        "content_type": "text",
                        "title": text,
                        "payload": text
                    }
                replies.push(reply);
            });
            sendQuickReply(sender, message.quickReplies.title, replies);
            break;
        case "image": //image
            sendImageMessage(sender, message.image.imageUri);
            break;
    }
}


function handleCardMessages(messages, sender) {

	let elements = [];
	for (var m = 0; m < messages.length; m++) {
		let message = messages[m];
		let buttons = [];
        for (var b = 0; b < message.card.buttons.length; b++) {
            let isLink = (message.card.buttons[b].postback.substring(0, 4) === 'http');
            let button;
            if (isLink) {
                button = {
                    "type": "web_url",
                    "title": message.card.buttons[b].text,
                    "url": message.card.buttons[b].postback
                }
            } else {
                button = {
                    "type": "postback",
                    "title": message.card.buttons[b].text,
                    "payload": message.card.buttons[b].postback
                }
            }
            buttons.push(button);
        }


		let element = {
            "title": message.card.title,
            "image_url":message.card.imageUri,
            "subtitle": message.card.subtitle,
			"buttons": buttons
		};
		elements.push(element);
	}
	sendGenericMessage(sender, elements);
}


function handleMessages(messages, sender) {
    let timeoutInterval = 1100;
    let previousType ;
    let cardTypes = [];
    let timeout = 0;
    for (var i = 0; i < messages.length; i++) {

        if ( previousType == "card" && (messages[i].message != "card" || i == messages.length - 1)) {
            timeout = (i - 1) * timeoutInterval;
            setTimeout(handleCardMessages.bind(null, cardTypes, sender), timeout);
            cardTypes = [];
            timeout = i * timeoutInterval;
            setTimeout(handleMessage.bind(null, messages[i], sender), timeout);
        } else if ( messages[i].message == "card" && i == messages.length - 1) {
            cardTypes.push(messages[i]);
            timeout = (i - 1) * timeoutInterval;
            setTimeout(handleCardMessages.bind(null, cardTypes, sender), timeout);
            cardTypes = [];
        } else if ( messages[i].message == "card") {
            cardTypes.push(messages[i]);
        } else  {

            timeout = i * timeoutInterval;
            setTimeout(handleMessage.bind(null, messages[i], sender), timeout);
        }

        previousType = messages[i].message;

    }
}

function handleDialogFlowResponse(sender, response) {
    let responseText = response.fulfillmentMessages.fulfillmentText;

    let messages = response.fulfillmentMessages;
    let action = response.action;
    let contexts = response.outputContexts;
    let parameters = response.parameters;

	sendTypingOff(sender);

    if (isDefined(action)) {
        handleDialogFlowAction(sender, action, messages, contexts, parameters);
    } else if (isDefined(messages)) {
		console.log("messages","entrando");
        handleMessages(messages, sender);
	} else if (responseText == '' && !isDefined(action)) {
		//dialogflow could not evaluate input.
		sendTextMessage(sender, "I'm not sure what you want. Can you be more specific?");
	} else if (isDefined(responseText)) {
		sendTextMessage(sender, responseText);
	}
}

async function sendToDialogFlow(sender, textString, params) {

    sendTypingOn(sender);

    try {
        const sessionPath = sessionClient.sessionPath(
            config.GOOGLE_PROJECT_ID,
            sessionIds.get(sender)
        );

        const request = {
            session: sessionPath,
            queryInput: {
                text: {
                    text: textString,
                    languageCode: config.DF_LANGUAGE_CODE,
                },
            },
            queryParams: {
                payload: {
                    data: params
                }
            }
		};
		//console.log(request);
        const responses = await sessionClient.detectIntent(request);
		//console.log(responses[0].queryResult);
        const result = responses[0].queryResult;
        handleDialogFlowResponse(sender, result);
    } catch (e) {
        console.log('error');
        console.log(e);
    }

}




function sendTextMessage(recipientId, text) {
	var messageData = {
		recipient: {
			id: recipientId
		},
		message: {
			text: text
		}
	}
	callSendAPI(messageData);
}

/*
 * Send an image using the Send API.
 *
 */
function sendImageMessage(recipientId, imageUrl) {
	var messageData = {
		recipient: {
			id: recipientId
		},
		message: {
			attachment: {
				type: "image",
				payload: {
					url: imageUrl
				}
			}
		}
	};

	callSendAPI(messageData);
}

/*
 * Send a Gif using the Send API.
 *
 */
function sendGifMessage(recipientId) {
	var messageData = {
		recipient: {
			id: recipientId
		},
		message: {
			attachment: {
				type: "image",
				payload: {
					url: config.SERVER_URL + "/assets/instagram_logo.gif"
				}
			}
		}
	};

	callSendAPI(messageData);
}

/*
 * Send audio using the Send API.
 *
 */
function sendAudioMessage(recipientId) {
	var messageData = {
		recipient: {
			id: recipientId
		},
		message: {
			attachment: {
				type: "audio",
				payload: {
					url: config.SERVER_URL + "/assets/sample.mp3"
				}
			}
		}
	};

	callSendAPI(messageData);
}

/*
 * Send a video using the Send API.
 * example videoName: "/assets/allofus480.mov"
 */
function sendVideoMessage(recipientId, videoName) {
	var messageData = {
		recipient: {
			id: recipientId
		},
		message: {
			attachment: {
				type: "video",
				payload: {
					url: config.SERVER_URL + videoName
				}
			}
		}
	};

	callSendAPI(messageData);
}

/*
 * Send a video using the Send API.
 * example fileName: fileName"/assets/test.txt"
 */
function sendFileMessage(recipientId, fileName) {
	var messageData = {
		recipient: {
			id: recipientId
		},
		message: {
			attachment: {
				type: "file",
				payload: {
					url: config.SERVER_URL + fileName
				}
			}
		}
	};

	callSendAPI(messageData);
}



/*
 * Send a button message using the Send API.
 *
 */
function sendButtonMessage(recipientId, text, buttons) {
	var messageData = {
		recipient: {
			id: recipientId
		},
		message: {
			attachment: {
				type: "template",
				payload: {
					template_type: "button",
					text: text,
					buttons: buttons
				}
			}
		}
	};

	callSendAPI(messageData);
}



function sendOptionsDrinks(recipientId){
	
		const optionDrinks ={
			method: 'GET',
			uri: 'https://aify-test.herokuapp.com/food/drinktag/list/',
			
		}
		//sendTypingOn(recipientId);
		requestP(optionDrinks).then(apiRes=>{
				var response = JSON.parse(apiRes);
				console.log(response.length);

				let arrayDrinks = []
				for(var i=0 ; i<11;i++){

						var tempOption={
							"content_type":"text",
							"title":response[i].name,
							"payload": "list_cocktails",
						}

						arrayDrinks.push(tempOption);

				}


				var messageData = {
					recipient: {
						id: recipientId
					},
					message:{
						"text": " (Select or type it in the ingredients or the exact name, I will do my best 😉 )",
						"quick_replies":arrayDrinks
					}}

					callSendAPI(messageData);
		
		});	



}




function sendListInitOptions(recipientId){
	var messageData = {
		recipient: {
			id: recipientId
		},
		message: {
			attachment: {
				"type": "template",
				"payload": {
					"template_type": "list",
					"top_element_style": "compact",
					"elements": [
						{
							"title": "We're chilling here",
							"subtitle": "Find were we are now",
							"image_url": "http://www.stickpng.com/assets/images/580b57fbd9996e24bc43bdfe.png",          
							"buttons": [
								{
									"title": "Find Us",
									"type": "postback",
									 "payload":"find"           
								}
							]
						},
						{
							"title": "Bars I can suggest",
							"subtitle": "Bars I know around you",
							"image_url": "http://www.stickpng.com/assets/images/580b57fbd9996e24bc43bdfe.png",          
							"buttons": [
								{
									"title": "Bars I know here",
									"type": "postback",
									 "payload":"bars"           
								}
							]
						},
						{
							"title": "Drinks I can suggest",
							"subtitle": "Drinks I have in my memory cell after year of drinking activities",
							"image_url": "http://www.stickpng.com/assets/images/580b57fbd9996e24bc43bdfe.png",          
							"buttons": [
								{
									"title": "Drinks I know",
									"type": "postback",
									 "payload":"drinks"           
								}
							]
						},
						{
							"title": "My preferences",
							"subtitle": "Tell anything you want me to take into account when suggest something",
							"image_url": "http://www.stickpng.com/assets/images/580b57fbd9996e24bc43bdfe.png",          
							"buttons": [
								{
									"title": "Update my preferences",
									"type": "postback",
									 "payload":"preferences"           
								}
							]
						}
					]
				}
			}
		}
	};

	callSendAPI(messageData);
}


function sendListRecomendation(recipientId, results){

	var messageData = {
		recipient: {
			id: recipientId
		},
		message: {
			attachment: {
				type: "template",
				"payload": {
					"template_type": "list",
					"top_element_style": "compact",
					"elements": [
					  {
						"title": results[0].name,
						"image_url": results[0].image_url,
						"subtitle": results[0].walk_time +  " min walk",
						"buttons": [
						  {
							"type": "postback",
							"payload": "Buy now",
							"title": "Buy now"
						  }
						],
						"default_action": {
						  "type": "web_url",
						  "url": results[0].website,
						  "webview_height_ratio": "tall"
						}
					  },
					  {
						"title": results[1].name,
						"image_url": results[1].image_url,
						"subtitle": results[1].walk_time +  " min walk",
						"buttons": [
						  {
							"type": "postback",
							"payload": "Buy now",
							"title": "Buy now"
						  }
						],
						"default_action": {
						  "type": "web_url",
						  "url": results[1].website,
						  "webview_height_ratio": "tall"
						}
					  },
					  {
						"title": results[2].name,
						"image_url": results[2].image_url,
						"subtitle": results[2].walk_time +  " min walk",
						"buttons": [
						  {
							"type": "postback",
							"payload": "Buy now",
							"title": "Buy now"
						  }
						],
						"default_action": {
						  "type": "web_url",
						  "url": results[2].website,
						  "webview_height_ratio": "tall"
						}
					  },
					  {
						"title": results[3].name,
						"image_url": results[3].image_url,
						"subtitle": results[3].walk_time +  " min walk",
						"buttons": [
						  {
							"type": "postback",
							"payload": "Buy now",
							"title": "Buy now"
						  }
						],
						"default_action": {
						  "type": "web_url",
						  "url": results[3].website,
						  "webview_height_ratio": "tall"
						}
					  }
					],
					"buttons": [
					  {
						"title": "View More",
						"type": "postback",
						"payload": "payload"
					  }
					]
				  }
			}
		}
	};

	callSendAPI(messageData);

}



function sendGenericMessage(recipientId, elements) {
	var messageData = {
		recipient: {
			id: recipientId
		},
		message: {
			attachment: {
				type: "template",
				payload: {
					template_type: "generic",
					elements: elements
				}
			}
		}
	};

	callSendAPI(messageData);
}


function sendReceiptMessage(recipientId, recipient_name, currency, payment_method,
							timestamp, elements, address, summary, adjustments) {
	// Generate a random receipt ID as the API requires a unique ID
	var receiptId = "order" + Math.floor(Math.random() * 1000);

	var messageData = {
		recipient: {
			id: recipientId
		},
		message: {
			attachment: {
				type: "template",
				payload: {
					template_type: "receipt",
					recipient_name: recipient_name,
					order_number: receiptId,
					currency: currency,
					payment_method: payment_method,
					timestamp: timestamp,
					elements: elements,
					address: address,
					summary: summary,
					adjustments: adjustments
				}
			}
		}
	};

	callSendAPI(messageData);
}

/*
 * Send a message with Quick Reply buttons.
 *
 */
function sendQuickReply(recipientId, text, replies, metadata) {
	var messageData = {
		recipient: {
			id: recipientId
		},
		message: {
			text: text,
			metadata: isDefined(metadata)?metadata:'',
			quick_replies: replies
		}
	};

	callSendAPI(messageData);
}


/*
 * Send a message with Quick Reply Location
 *
 */
function sendQuickReplyLocation(recipientId, text, replies, metadata) {
	var messageData = {
		recipient: {
			id: recipientId
		},
		message: {
			text: text,
			metadata: isDefined(metadata)?metadata:'',
			quick_replies: replies,
		}
	};

	callSendAPI(messageData);
}







/*
 * Send a read receipt to indicate the message has been read
 *
 */
function sendReadReceipt(recipientId) {

	var messageData = {
		recipient: {
			id: recipientId
		},
		sender_action: "mark_seen"
	};

	callSendAPI(messageData);
}

/*
 * Turn typing indicator on
 *
 */
function sendTypingOn(recipientId) {


	var messageData = {
		recipient: {
			id: recipientId
		},
		sender_action: "typing_on"
	};

	callSendAPI(messageData);
}

/*
 * Turn typing indicator off
 *
 */
function sendTypingOff(recipientId) {


	var messageData = {
		recipient: {
			id: recipientId
		},
		sender_action: "typing_off"
	};

	callSendAPI(messageData);
}

/*
 * Send a message with the account linking call-to-action
 *
 */
function sendAccountLinking(recipientId) {
	var messageData = {
		recipient: {
			id: recipientId
		},
		message: {
			attachment: {
				type: "template",
				payload: {
					template_type: "button",
					text: "Welcome. Link your account.",
					buttons: [{
						type: "account_link",
						url: config.SERVER_URL + "/authorize"
          }]
				}
			}
		}
	};

	callSendAPI(messageData);
}


function greetUserText(userId) {
	//first read user firstname
	request({
		uri: 'https://graph.facebook.com/v3.2/' + userId,
		qs: {
			access_token: config.FB_PAGE_TOKEN
		}

	}, function (error, response, body) {
		if (!error && response.statusCode == 200) {

			var user = JSON.parse(body);

			if (user.first_name) {
				console.log("FB user: %s %s, %s",
					user.first_name, user.last_name, user.gender);

				sendTextMessage(userId, "Hi " + user.first_name + '!');
			} else {
				console.log("Cannot get data for fb user with id",
					userId);
			}
		} else {
			console.error(response.error);
		}

	});
}

/*
 * Call the Send API. The message data goes in the body. If successful, we'll 
 * get the message id in a response 
 *
 */
function callSendAPI(messageData) {
	request({
		uri: 'https://graph.facebook.com/v2.6/me/messages',
		qs: {
			access_token: config.FB_PAGE_TOKEN
		},
		method: 'POST',
		json: messageData

	}, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			var recipientId = body.recipient_id;
			var messageId = body.message_id;

			if (messageId) {
				console.log("Successfully sent message with id %s to recipient %s",
					messageId, recipientId);
			} else {
				console.log("Successfully called Send API for recipient %s",
					recipientId);
			}
		} else {
			console.error("Failed calling Send API", response.statusCode, response.statusMessage, body.error);
		}
	});
}





/*
 * Message Read Event
 *
 * This event is called when a previously-sent message has been read.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-read
 * 
 */
function receivedMessageRead(event) {
	var senderID = event.sender.id;
	var recipientID = event.recipient.id;

	// All messages before watermark (a timestamp) or sequence have been seen.
	var watermark = event.read.watermark;
	var sequenceNumber = event.read.seq;

	console.log("Received message read event for watermark %d and sequence " +
		"number %d", watermark, sequenceNumber);
}

/*
 * Account Link Event
 *
 * This event is called when the Link Account or UnLink Account action has been
 * tapped.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/account-linking
 * 
 */
function receivedAccountLink(event) {
	var senderID = event.sender.id;
	var recipientID = event.recipient.id;

	var status = event.account_linking.status;
	var authCode = event.account_linking.authorization_code;

	console.log("Received account link event with for user %d with status %s " +
		"and auth code %s ", senderID, status, authCode);
}

/*
 * Delivery Confirmation Event
 *
 * This event is sent to confirm the delivery of a message. Read more about 
 * these fields at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-delivered
 *
 */
function receivedDeliveryConfirmation(event) {
	var senderID = event.sender.id;
	var recipientID = event.recipient.id;
	var delivery = event.delivery;
	var messageIDs = delivery.mids;
	var watermark = delivery.watermark;
	var sequenceNumber = delivery.seq;

	if (messageIDs) {
		messageIDs.forEach(function (messageID) {
			console.log("Received delivery confirmation for message ID: %s",
				messageID);
		});
	}

	console.log("All message before %d were delivered.", watermark);
}

/*
 * Authorization Event
 *
 * The value for 'optin.ref' is defined in the entry point. For the "Send to 
 * Messenger" plugin, it is the 'data-ref' field. Read more at 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/authentication
 *
 */
function receivedAuthentication(event) {
	var senderID = event.sender.id;
	var recipientID = event.recipient.id;
	var timeOfAuth = event.timestamp;

	// The 'ref' field is set in the 'Send to Messenger' plugin, in the 'data-ref'
	// The developer can set this to an arbitrary value to associate the 
	// authentication callback with the 'Send to Messenger' click event. This is
	// a way to do account linking when the user clicks the 'Send to Messenger' 
	// plugin.
	var passThroughParam = event.optin.ref;

	console.log("Received authentication for user %d and page %d with pass " +
		"through param '%s' at %d", senderID, recipientID, passThroughParam,
		timeOfAuth);

	// When an authentication is received, we'll send a message back to the sender
	// to let them know it was successful.
	sendTextMessage(senderID, "Authentication successful");
}

/*
 * Verify that the callback came from Facebook. Using the App Secret from 
 * the App Dashboard, we can verify the signature that is sent with each 
 * callback in the x-hub-signature field, located in the header.
 *
 * https://developers.facebook.com/docs/graph-api/webhooks#setup
 *
 */
function verifyRequestSignature(req, res, buf) {
	var signature = req.headers["x-hub-signature"];

	if (!signature) {
		throw new Error('Couldn\'t validate the signature.');
	} else {
		var elements = signature.split('=');
		var method = elements[0];
		var signatureHash = elements[1];

		var expectedHash = crypto.createHmac('sha1', config.FB_APP_SECRET)
			.update(buf)
			.digest('hex');

		if (signatureHash != expectedHash) {
			throw new Error("Couldn't validate the request signature.");
		}
	}
}

function isDefined(obj) {
	if (typeof obj == 'undefined') {
		return false;
	}

	if (!obj) {
		return false;
	}

	return obj != null;
}

// Spin up the server
app.listen(app.get('port'), function () {
	console.log('running on port', app.get('port'))
})
