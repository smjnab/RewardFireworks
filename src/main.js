const { Client } = require("dsteem");
const client = new Client("https://api.steemit.com");
const Phaser = require("phaser");


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// CONFIG
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const msUpdateRate = 3000; //3000 is rate of new blocks produced
const spToVest = 2021; //Lazy, could not recall how this is actually calculated. Should fix.


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// INIT
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var price;  //Sets the median price of SBD.
var rate;   //Sets conversion rate of 1 SBD in Steem.
var previousBlockNum; //Track the last block used to make fireworks.
var getClaimedRewardsTimeout; //Stores timeout for block processing to find Claimed rewards.
var showCurrentBlock = true;

Init();

async function Init() {
    console.log("Init");

    price = await client.database.getCurrentMedianHistoryPrice();
    rate = price.base.amount;
    previousBlockNum = 0;

    GetClaimedRewards();
}


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// BLOCK PROCESSING FOR CLAIM REWARD DATA
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

async function GetClaimedRewards() {
    const timeAtStart = performance.now(); // To track block processing time.
    const blockNum = await client.blockchain.getCurrentBlockNum();

    if (blockNum != previousBlockNum) {
        // Config starting block for each pass.
        if (previousBlockNum == 0) previousBlockNum = blockNum; //On first pass fetch the current block.
        else previousBlockNum += 1; //Increase one as to not fetch same block twice.

        // Iterate through each block since last processed block.
        while (previousBlockNum <= blockNum) {
            const block = await client.database.getBlock(previousBlockNum);

            if (showCurrentBlock) document.getElementById("BlockProcess").innerHTML = "Checking Block: " + previousBlockNum;

            // Look for any reward claims in each block.
            block.transactions.forEach(transaction => {
                transaction.operations.forEach(operation => {
                    if (operation[0] === "claim_reward_balance") {

                        const accountName = operation[1]["account"];

                        // Get rewards.
                        var rewardS = operation[1]["reward_steem"];
                        var rewardSB = operation[1]["reward_sbd"];
                        var rewardV = operation[1]["reward_vests"];

                        // Remove currency letters from reward numbers.
                        rewardS = rewardS.substring(rewardS.length - 6, 0) * spToVest;
                        rewardSB = rewardSB.substring(rewardSB.length - 4, 0) / rate * spToVest;
                        rewardV = rewardV.substring(rewardV.length - 6, 0);

                        // Create a new firework based on combined reward value of claim.
                        const rocketPower = parseFloat(rewardS) + parseFloat(rewardSB) + parseFloat(rewardV);

                        FireRocket(accountName, rocketPower);
                    }
                });
            });

            previousBlockNum++;
        }

        previousBlockNum = blockNum;
    }

    // Calculate time passed, start a new block processing pass now or at time left on msUpdateRate 
    const timeAtEnd = performance.now();
    const updateRate = msUpdateRate - (timeAtEnd - timeAtStart);

    if (updateRate > 0) getClaimedRewardsTimeout = setTimeout(GetClaimedRewards, updateRate);
    else getClaimedRewardsTimeout = setTimeout(GetClaimedRewards, 0);
}


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// PHASER BASE
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var windowWidth = window.innerWidth;
var windowHeight = window.innerHeight - 36;
var phaser;
var waitingForClaimsText;

var config = {
    type: Phaser.AUTO,
    autoResize: true,
    width: windowWidth,
    height: windowHeight,
    pixelArt: true,
    physics: {
        default: "arcade",
        arcade: {
            gravity: { y: 200 }
        }
    },
    scene: {
        preload: Preload,
        create: Create
    },
    parent: "PhaserDiv"
};

var game = new Phaser.Game(config);

window.addEventListener("resize", Resize);

function Preload() {
    this.load.setBaseURL("fireworks_files");
    this.load.image("white1px", "images/white1px.png");
}

function Create() {
    phaser = this;

    // Initial waiting message
    waitingForClaimsText = this.add.text(windowWidth / 2, windowHeight / 3, "Waiting for a reward claim...\n\nTired of waiting?\nTry claiming your own reward!", { fontSize: "16px", fill: "#FFF" });
    waitingForClaimsText.x -= waitingForClaimsText.width / 2;
}

function Resize() {
    var canvas = document.querySelector("canvas");

    windowWidth = window.innerWidth;
    windowHeight = window.innerHeight - 36;

    canvas.style.width = windowWidth + "px";
    canvas.style.height = windowHeight + "px";

    FitWidth();
}

// Simplify particle creation.
function EmitterMaker(particle, particleSpeed, scaleMin, scaleMax, tint, rocketPower, angelMin = 0, angelMax = 360, lifespan = 2000) {
    var numPart = parseInt(3 + rocketPower / 100);

    return emitter = particle.createEmitter({
        speed: particleSpeed,
        scale: { start: scaleMin * 2, end: scaleMax * 2 },
        blendMode: "ADD",
        tint: tint,
        alpha: {
            start: 10, end: 5
        },
        angle: { min: angelMin, max: angelMax },
        lifespan: lifespan,
        gravityY: 70 + numPart / 5,
        maxParticles: numPart
    });
}


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// FIREWORKS
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function FireRocket(accountName, rocketPower) {
    // Remove waiting text.
    waitingForClaimsText.destroy();

    // Create a sparkling trail for rocket
    var trail = phaser.add.particles("white1px");

    var sparks1 = EmitterMaker(trail, 80, 1, 0, 0xFFFFDD99, rocketPower, 45, 90, 500);
    var sparks2 = EmitterMaker(trail, 100, 1.2, 0, 0xFFFFAF22, rocketPower, 45, 90, 500);
    sparks1.frequency = 50;
    sparks2.frequency = 50;

    // Determine speed to use, the bigger the reward, the higher the rocket goes.
    var velocity;

    if (rocketPower <= 150) velocity = 125 + rocketPower / 2;
    else velocity = 200 + rocketPower / 10;

    velocity = Math.min(velocity, Math.min(window.innerHeight * .62, 600));

    // Random direction
    var direction = Math.floor(Math.random() * 175) + 1;
    direction *= Math.floor(Math.random() * 2) == 1 ? 1 : -1;

    // Create rocket and position it in the bottom center of screen.
    var rocket = phaser.physics.add.image(1, 1, "white1px");
    rocket.x = windowWidth / 2 + direction / 3;
    rocket.y = windowHeight - 2;
    rocket.setVelocity(direction, -velocity);
    rocket.setBounce(1, 0.25);
    rocket.setCollideWorldBounds(true);
    rocket.tint = 0xFFFFDD99;

    sparks1.startFollow(rocket);
    sparks2.startFollow(rocket);

    // When rocket at highest, explode it.
    var delay = velocity * 5.5;
    setTimeout(ExplodeRocket, delay, rocket, trail, rocketPower, accountName);

    console.log(accountName + " sends a rocket up with a power of: " + rocketPower + ". Fizz!");
}

function ExplodeRocket(rocket, trail, rocketPower, accountName) {
    // Random colors for name of the account claiming reward
    var colorArray = [
        0xFFFFFFFF, 0xFFFFAAFF, 0xFFFFFFAA,
        0xFFAAFFFF, 0xFFFFAAAA, 0xFFAAFFAA,
        0xFFAAAAFF, 0xFFCFAFEF, 0xFFAFEFCF,
        0xFFAFCFEF, 0xFFEFCFAF
    ];

    // Text with the name of the account
    var rocketName = phaser.add.text(rocket.x, rocket.y, accountName, { fontSize: "14px", fill: "#FFF" });
    rocketName.tint = colorArray[parseInt(Math.random() * 10)];
    rocketName.x -= rocketName.width / 2;

    if (rocketName.x < 0) rocketName.x = 5;
    else if (rocketName.x + rocketName.width > window.innerWidth) rocketName.x = rocketName.x - rocketName.width / 2 - 2;

    // Move the account name
    var moveLoopCount = 0;

    setInterval(() => {
        if (moveLoopCount > 120) return;

        if (moveLoopCount < 1) rocketName.y -= 2;
        else if (moveLoopCount < 3) rocketName.y -= 1;
        else if (moveLoopCount < 6) { }
        else rocketName.y += 1;

        moveLoopCount++;
    }, 50);

    // Explosion particle
    var explosion = phaser.add.particles("white1px");
    explosion.x = rocket.x;
    explosion.y = rocket.y;

    // Rocket stage colors
    var colorArraySparks = [
        0xFFFF9090, 0xFF90FF90, 0xFF9090FF,
        0xFFFFFF90, 0xFFFF90FF, 0xFF90FFFF,
        0xFFff7800, 0xFFa8ff00, 0xFF00ffae,
        0xFFae00ff, 0xFFf1eedd
    ];

    var sparkArray = [
        EmitterMaker(explosion, 60, 0.4, 2, colorArraySparks[parseInt(Math.random() * 10)], rocketPower),
    ];

    // Bigger, more colorful explosion for increasingly larger reward claims.
    if (rocketPower > 500) sparkArray.push(EmitterMaker(explosion, 65, 0.6, 2, colorArraySparks[parseInt(Math.random() * 10)], rocketPower));
    if (rocketPower > 1000) sparkArray.push(EmitterMaker(explosion, 75, 0.8, 2, colorArraySparks[parseInt(Math.random() * 10)], rocketPower / 2));
    if (rocketPower > 3000) sparkArray.push(EmitterMaker(explosion, 90, 1, 3, colorArraySparks[parseInt(Math.random() * 10)], rocketPower / 3));
    if (rocketPower > 6000) sparkArray.push(EmitterMaker(explosion, 105, 1.5, 3, colorArraySparks[parseInt(Math.random() * 10)], rocketPower / 6));
    if (rocketPower > 10000) sparkArray.push(EmitterMaker(explosion, 120, 2, 4, colorArraySparks[parseInt(Math.random() * 10)], rocketPower / 10));
    if (rocketPower > 15000) sparkArray.push(EmitterMaker(explosion, 115, 2.5, 4.5, colorArraySparks[parseInt(Math.random() * 10)], rocketPower / 15));
    if (rocketPower > 25000) sparkArray.push(EmitterMaker(explosion, 110, 2.5, 4.5, colorArraySparks[parseInt(Math.random() * 10)], rocketPower / 25));
    if (rocketPower > 50000) sparkArray.push(EmitterMaker(explosion, 100, 2.5, 4.5, colorArraySparks[parseInt(Math.random() * 10)], rocketPower / 50));
    if (rocketPower > 100000) sparkArray.push(EmitterMaker(explosion, 130, 2.5, 4.5, colorArraySparks[parseInt(Math.random() * 10)], rocketPower / 100));

    setTimeout(StopExplosion, 750, sparkArray);
    setTimeout(RemoveExplosion, 4000, explosion, rocketName);

    rocket.destroy();
    trail.destroy();
}

function StopExplosion(sparkArray) {
    sparkArray.forEach(
        spark => {
            spark.explode();
        });
}

function RemoveExplosion(explosion, rocketName) {
    explosion.destroy();
    rocketName.destroy();
}


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// USER EVENTS
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Get username.
document.getElementById("FormButton").onclick = () => {
    document.getElementById("FormButton").disabled = true;

    var username = document.getElementById("FormText").value;

    username = username.substring(0, 16);
    username = username.toLowerCase().replace(/[^a-zA-Z0-9]+/g, "-");

    GetAccountRewards(username);
};

// Using enter key instead of button to get username.
document.getElementById("FormText").addEventListener("keyup", keyUp => {
    keyUp.preventDefault();

    if (keyUp.keyCode === 13) {
        document.getElementById("FormButton").onclick();
    }
});

// Get steem account and check for rewards.
async function GetAccountRewards(username) {
    const account = await client.database.getAccounts([username])

    if (waitingForClaimsText != undefined) waitingForClaimsText.destroy();
    waitingForClaimsText = phaser.add.text(windowWidth / 2, windowHeight / 3, "Checking for rewards...", { fontSize: "16px", fill: "#FFF" });
    waitingForClaimsText.x -= waitingForClaimsText.width / 2;

    if (account.length > 0) {
        if (waitingForClaimsText != undefined) waitingForClaimsText.destroy();

        const steemReward = encodeURIComponent(account[0].reward_steem_balance);
        const sbdReward = encodeURIComponent(account[0].reward_sbd_balance);
        const vestReward = encodeURIComponent(account[0].reward_vesting_balance);
        const redirect = encodeURIComponent(window.location.href);
        const url = `https://steemconnect.com/sign/claim-reward-balance?account=${username}&reward_steem=${steemReward}&reward_sbd=${sbdReward}&reward_vests=${vestReward}&redirect_uri=${redirect}`;

        // Re-direct user to Steem Connect, user will get re-directed back after transaction created.
        window.location.href = url;
    }
}

// Remove placeholder text for input field.
document.getElementById("FormText").onfocus = () => {
    document.getElementById("FormButton").disabled = false;
    document.getElementById("FormText").placeholder = "";
    document.getElementById("FormText").style.color = "#000000";
    document.getElementById("FormText").style.fontStyle = "normal";
}


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// HTML TWEAKS
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

FitWidth();

// Remove created by and block info when screen too narrow.
function FitWidth() {
    if (window.innerWidth < 640) {
        showCurrentBlock = false;
        document.getElementById("CreatedBy").innerHTML = "";
        document.getElementById("BlockProcess").innerHTML = "";
    } else {
        showCurrentBlock = true;
        document.getElementById("CreatedBy").innerHTML = "Created by @smjn";
    }
}