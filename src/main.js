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
var stopBlockProcessing; //Stop async block iteration.
var getClaimedRewardsTimeout; //Stores timeout for block processing to find Claimed rewards.

Init();

async function Init() {
    console.log("Init");

    price = await client.database.getCurrentMedianHistoryPrice();
    rate = price.base.amount;
    previousBlockNum = 0;
    stopBlockProcessing = false;

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
            if (stopBlockProcessing) return;

            const block = await client.database.getBlock(previousBlockNum);

            document.getElementById("BlockProcess").innerHTML = "Checking Block: " + previousBlockNum;

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

function StopBlockProcessing() {
    console.log("Stopped.");

    clearTimeout(getClaimedRewardsTimeout);
    stopBlockProcessing = true;

    // Paused message.
    if (waitingForClaimsText != undefined) waitingForClaimsText.destroy();
    waitingForClaimsText = phaser.add.text(windowWidth / 2, windowHeight / 3, "Paused... Interact to resume.", { fontSize: "16px", fill: "#FFF" });
    waitingForClaimsText.x -= waitingForClaimsText.width / 2;
}


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// PHASER BASE
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var windowWidth = window.innerWidth;
var windowHeight = window.innerHeight - 32;
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
    windowHeight = window.innerHeight - 32;

    canvas.style.width = windowWidth + "px";
    canvas.style.height = windowHeight + "px";
}

// Simplify particle creation.
function EmitterMaker(particle, particleSpeed, scaleMin, scaleMax, tint, angelMin = 0, angelMax = 360, lifespan = 2000) {
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
        gravityY: 70,
        maxParticles: 50
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

    var sparks1 = EmitterMaker(trail, 100, 1, 0, 0xFFFFDD99, 45, 90, 500);
    var sparks2 = EmitterMaker(trail, 120, 1.2, 0, 0xFFFFAF22, 45, 90, 500);
    sparks1.frequency = 50;
    sparks2.frequency = 50;

    // Determine speed to use, the bigger the reward, the higher the rocket goes.
    var velocity;

    if (rocketPower < 150) velocity = 80 + Math.floor(Math.random() * 60) + 20;
    else if (rocketPower > 500) velocity = 300 + parseFloat(rocketPower / 10);
    else velocity = rocketPower;

    if (velocity > 550) velocity = 550;

    // Random direction
    var direction = Math.floor(Math.random() * 150) + 1;
    direction *= Math.floor(Math.random() * 2) == 1 ? 1 : -1;

    // Create rocket and position it in the bottom center of screen.
    var rocket = phaser.physics.add.image(1, 1, "white1px");
    rocket.x = windowWidth / 2 + direction / 4;
    rocket.y = windowHeight - 1;
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

    var sparkArray = [
        EmitterMaker(explosion, 95, 0.4, 2, 0xFFFF5FAA),
    ];

    // Bigger, more colorful explosion for increasingly larger reward claims.
    if (rocketPower > 300) sparkArray.push(EmitterMaker(explosion, 105, 0.6, 2, 0xFFEF4FDA));
    if (rocketPower > 750) sparkArray.push(EmitterMaker(explosion, 115, 0.8, 2, 0xFFEF8FBA));
    if (rocketPower > 1500) sparkArray.push(EmitterMaker(explosion, 125, 1, 3, 0xFF5F5FBA));
    if (rocketPower > 3000) sparkArray.push(EmitterMaker(explosion, 200, 1.5, 3, 0xFFAA5AFF));
    if (rocketPower > 6000) sparkArray.push(EmitterMaker(explosion, 225, 2, 4, 0xFF5F5FFF));
    if (rocketPower > 10000) sparkArray.push(EmitterMaker(explosion, 175, 2.5, 4.5, 0xFFFFFFFF));
    if (rocketPower > 15000) sparkArray.push(EmitterMaker(explosion, 200, 2.5, 4.5, 0xFFFF3F3F));

    setTimeout(StopExplosion, 1000, sparkArray);
    setTimeout(RemoveExplosion, 3000, explosion, rocketName);

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
