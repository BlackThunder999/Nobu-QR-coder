const canvas = document.getElementById("canvas");
const generateBtn = document.getElementById("generate");
const downloadBtn = document.getElementById("download");

const typeSelect = document.getElementById("type");
const contentInput = document.getElementById("content");

const qrColor = document.getElementById("qrColor");
const bgColor = document.getElementById("bgColor");

let qr = new QRCodeStyling({
    width: 320,
    height: 320,
    type: "canvas",
    data: "https://nobuqr.com",

    image: "",

    dotsOptions: {
        color: "#000000",
        type: "rounded"
    },

    backgroundOptions: {
        color: "#ffffff"
    },

    cornersSquareOptions: {
        type: "extra-rounded"
    },

    cornersDotOptions: {
        type: "dot"
    },

    imageOptions: {
        crossOrigin: "anonymous",
        margin: 6
    }
});

qr.append(canvas);

function getQRData(){

    let value = contentInput.value.trim();

    if(value===""){
        alert("Введите данные.");
        return null;
    }

    switch(typeSelect.value){

        case "url":

            if(
                !value.startsWith("https://") &&
                !value.startsWith("http://")
            ){
                value="https://"+value;
            }

            break;

        case "phone":

            value="tel:"+value;

            break;

        case "email":

            value="mailto:"+value;

            break;

        case "wifi":

            value="WIFI:T:WPA;S:"+value+";P:password;;";

            break;

        case "text":

            break;

    }

    return value;

}
function generateQR(){

    const data = getQRData();

    if(!data){
        return;
    }

    qr.update({

        data: data,

        width: 320,
        height: 320,

        dotsOptions: {
            color: qrColor.value,
            type: "rounded"
        },

        backgroundOptions: {
            color: bgColor.value
        },

        cornersSquareOptions: {
            type: "extra-rounded"
        },

        cornersDotOptions: {
            type: "dot"
        }

    });

    canvas.style.transform = "scale(.9)";
    canvas.style.opacity = ".5";

    setTimeout(() => {
        canvas.style.transition = ".25s";
        canvas.style.transform = "scale(1)";
        canvas.style.opacity = "1";
    }, 50);

}

generateBtn.addEventListener("click", generateQR);

contentInput.addEventListener("keydown", (e) => {

    if(e.key === "Enter" && !e.shiftKey){
        e.preventDefault();
        generateQR();
    }

});

qrColor.addEventListener("input", () => {

    if(contentInput.value.trim() !== ""){
        generateQR();
    }

});

bgColor.addEventListener("input", () => {

    if(contentInput.value.trim() !== ""){
        generateQR();
    }

});
downloadBtn.addEventListener("click", () => {

    const data = getQRData();

    if (!data) {
        alert("Сначала создайте QR-код.");
        return;
    }

    qr.download({
        name: "Nobu-QR",
        extension: "png"
    });

});

// Создать QR автоматически при загрузке страницы
window.addEventListener("load", () => {

    contentInput.value = "https://google.com";

    generateQR();

});

// Автоматически генерировать QR при изменении типа
typeSelect.addEventListener("change", () => {

    if (contentInput.value.trim() !== "") {
        generateQR();
    }

});

// Очистка поля по двойному клику
contentInput.addEventListener("dblclick", () => {

    contentInput.value = "";

});
