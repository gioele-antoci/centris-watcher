import axios from "axios";
import htmlParser from "node-html-parser";
import { BehaviorSubject, forkJoin, from, interval, of, timer } from "rxjs";
import playsound from "play-sound"
import { catchError, take, switchMap, distinctUntilChanged, filter, share, withLatestFrom } from "rxjs/operators";

import yargs from 'yargs';
import { hideBin } from "yargs/helpers";
import { dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

const args = yargs(hideBin(process.argv)).argv;
console.log("arguments", args);

process.on('exit', function (code) {
    return console.log(`About to exit with code ${code}`);
});

const centrisUrl = args.centris;
const iotCommand = args.IOTCommand;
const mapKey = args.mapKey;

const playSoundInstance = playsound();

// process.exit(1)

const blueLineAddresses = [
    "5111 Chemin Queen-Mary, Montreal",
    "3740 Avenue Lacombe, Montreal",
    "2830, boul. Édouard-Monpetit, Montreal",
    "2040, boul. Édouard-Monpetit, Montreal",
    "1371 Avenue Van Horne, Montreal",
    "1050 Avenue Beaumont, Mont-Royal",
    "400 Avenue Ogilvy, Montreal",
    "7300 Boulevard Saint-Laurent, Montreal",
    "505 Rue Jean-Talon Est, Montreal",
    "1551 Rue Jean-Talon Est, Montreal",
    "7144 Rue D'Iberville, Montreal",
    "7325 Boulevard Saint-Michel, Montreal"
];

const greenLineAddresses = [
    "7907 Rue Sherbrooke Est, Montreal",
    "7195 Rue Sherbrooke Est, Montreal",
    "6590 Rue Sherbrooke Est, Montreal",
    "5995, rue Sherbrooke Est, Montreal",
    "3075, Boulevard De L'Assomption, Montreal",
    "4801 Avenue Pierre-De Coubertin, Montreal",
    "2700 Boulevard Pie-IX, Montreal",
    "3575 Rue Hochelaga, Montreal",
    "3100 Rue Hochelaga, Montreal",
    "2570 Rue Ontario Est, Montreal",
    "1427 Rue Cartier, Montreal",
    "1250 Rue Sainte-Catherine Est, Montreal",
    "1500 Rue Berri, Montreal",
    "12 Boulevard De Maisonneuve Est, Montreal",
    "266 Boulevard De Maisonneuve Ouest, Montreal",
    "625 Boulevard De Maisonneuve Ouest, Montreal",
    "1102 Boulevard De Maisonneuve Ouest, Montreal",
    "1622 Boulevard De Maisonneuve Ouest, Montreal",
    "2021 Avenue Atwater, Montreal",
    "620 Atwater Avenue, Montreal",
    "2567 Rue du Centre, Montreal",
    "305 Rue Caisse, Montreal",
    "4214 Rue Wellington, Montreal",
    "700 Rue Willibrord, Montreal",
    "6200 Rue Drake, Montreal",
    "6750 Boulevard Monk, Montreal"
];

const orangeLineAddresses = [
    "Rue Lucien Paiement, Laval",
    "1200 Boulevard De La Concorde Ouest, Laval",
    "5 boulevard Cartier Ouest, Laval",
    "575 Boulevard Henri-Bourassa Est, Montreal",
    "9961 Rue Berri, Montreal",
    "545 Boulevard Crémazie, Montreal",
    "8086 Rue Berri, Montreal",
    "505 Rue Jean-Talon Est, Montreal",
    "6542 Avenue De Chateaubriand, Montreal",
    "509 Boulevard Rosemont, Montreal",
    "501 Boulevard Saint-Joseph Est, Montreal",
    "482 Avenue du Mont-Royal Est, Montreal",
    "503 Rue Cherrier, Montreal",
    "1500 Rue Berri, Montreal",
    "960 Rue Sanguinet, Montreal",
    "960 Rue Saint-Urbain, Montreal",
    "640 Avenue Viger Ouest, Montreal",
    "1166, Avenue des Canadiens-de-Montréal, Montreal",
    "957 Rue Lucien-L'Allier, Montreal",
    "2060 Rue Saint-Antoine Ouest, Montreal",
    "620 Atwater Avenue, Montreal",
    "4087 Rue Saint-Jacques, Montreal",
    "5150 Boulevard De Maisonneuve Ouest, Montreal",
    "4243 Boulevard Décarie, Montreal",
    "5111 Chemin Queen-Mary, Montreal",
    "4735 Chemin de la Côte-Sainte-Catherine, Montreal",
    "6255-95 Avenue Victoria, Montreal",
    "7403 Boulevard Décarie, Montreal",
    "8251 Boulevard Décarie, Montreal",
    "590 Boulevard Décarie, Montreal"
];

const getAddressUrl = (address1, address2) => `https://www.mapquestapi.com/directions/v2/route?key=${mapKey}&from=${encodeURIComponent(address1)}&to=${encodeURIComponent(address2)}&routeType=pedestrian&unit=k`;
const requestDistance$ = (addressHouse, address2) => from(axios.get(getAddressUrl(addressHouse, address2))).pipe(
    catchError(() => of(null)),
    share());
const allStationsRequests$ = (addressHouse) => [...blueLineAddresses, ...greenLineAddresses, ...orangeLineAddresses].map(addressMetro => requestDistance$(addressHouse, addressMetro));
const canMakeRequest = () => {
    const date = new Date();
    return date.getHours() > 7 && date.getHours() <= 23;
};

let lastQueryDate = null;

const lastHouse$ = new BehaviorSubject("").pipe(
    filter(x => !!x),
    distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
    share());

lastHouse$.pipe(
    switchMap(() => interval(1500).pipe(take(6))),
    catchError(err => console.log("IOT command failed", err))
).subscribe(() => {
    axios.get(iotCommand);
});

lastHouse$.pipe(
    filter(x => !!x),
    catchError(err => console.log(`An error while retrieving addresses happened: ${err}`)),
    switchMap(lastHouse => {
        console.log("Checking addresses...");
        return forkJoin(allStationsRequests$(lastHouse.address));
    }),
    withLatestFrom(lastHouse$)
).subscribe(([requests, lastHouse]) => {
    const minDist = Math.min(...requests?.map(request => +request?.data?.route?.distance).filter(d => d >= 0));
    if (!isFinite(minDist)) {
        console.log("Couldn't calculate distance");
        return;
    }
    console.log(`Minimum distance from a metro station: ${minDist} km`)
    if (minDist > 1.5) {
        // do not play audio if it's too far from metro (farther than 1.5km)
        return;
    }
    console.log("NEW HOUSE near metro FOUND!")

    playSoundInstance.play(`./assets/${lastHouse.isJustNewPrice ? "just_a_price" : "new_house"}.mp3`, (err) => {
        if (err) {
            console.log("Error playing audio", err);
        }
    });
});

timer(0, 60000).pipe(
    catchError(err => console.log('Error: ', err.message)),
    filter(() => canMakeRequest()),
    switchMap(() => from(axios.get(centrisUrl)))
).subscribe((res) => {
    lastQueryDate = res?.headers?.date ? new Date(res.headers.date).toString() : 'no response date';

    const root = htmlParser.parse(res.data);
    // const nodes = root.querySelectorAll(".formula.J_formula a");
    const nodes = root.querySelectorAll(".multiLineDisplay");
    const allAddresses = Array.from(nodes).reduce((acc, node) => {
        // find the first anchor tag child of that class that has text content (which represents address)
        const address = node.querySelectorAll(".formula.J_formula a")?.find(n => !!n.textContent)?.textContent;
        if (address) {
            const newPriceLabel = node.querySelector(".mtx-subheader-badge")?.textContent;
            const isJustNewPrice = newPriceLabel === "New Price" || newPriceLabel === "Nouveau prix";
            acc.push({ address, isJustNewPrice });
        }
        return acc;
    }, []);

    const firstAddress = allAddresses[0];
    console.log(`Check done at ${lastQueryDate}, latest known house: ${firstAddress.address}`);
    lastHouse$.next(firstAddress);

    console.log("------------------------------------------");
});


