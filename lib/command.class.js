const iconv = require('iconv-lite');
const getPixels = require("get-pixels");
const qrimage = require("qr-image");

class Command {
    constructor ({ printeWidth = "80mm" } = {}) {
        this._cmd = Command.cmd;
        this._encoding = Command.encoding;
        this._textLength = Command.printeWidths[printeWidth];
        this._queue = [];
        this._state = {};
        this._init();
    }

    _init () {
        this._queue = [...this._cmd["GSP"], 22.5, 22.5];
        this._state = {
            fontSize: 0,
        }
    }

    _computeTextLength (text) {
        const chineseCharREG = /[^\x00-\xff]/;
        let length = 0;
        for (let i of text) {
            if (chineseCharREG.test(i)) length += 2;
            else length += 1;
        }
        return length;
    }

    /**
     * export command 
     */
    export () {
        if (this._queue.length === 0) throw "没有命令，无法导出！";
        const buf = Buffer.from([...this._queue, this._cmd["LF"]]);
        this._init();
        return buf;
    }

    /**
     * buzzer 
     * 
     * @param  {Number} count Buzzer name number, 1-9
     * @param  {Number} time  Buzzer sound time in milliseconds
     * @return {Command}
     */
    buzzer (count = 1, time = 100) {
        this._queue.push(...this._cmd["ESCB"], count, 100 / 50);
        return this;
    }

    /**
     * cut paper
     * 
     * @return {Command}
     */
    cut () {
        this._queue.push(...this._cmd["GSV"], 1);
        return this;
    }

    /**
     * write text 
     * 
     * @param  {String} text
     * @return {Command}
     */
    text (text = "", ) {
        this._queue.push(...iconv.encode(text, this._encoding));
        return this;
    }

    /**
     * Centered text on a single line
     * 
     * @param  {String} text text args
     * @param  {String} replace Replace text, replace blank parts
     * @return {Command}
     */
    textCenter (text = "", replace = " ") {
        let 
        length = this._textLength / (this._state.fontSize + 1),
        textLength = this._computeTextLength(text),
        LRWidth = (length - textLength) / 2;
        this._queue.push(...iconv.encode(replace.repeat(LRWidth) + text + replace.repeat(LRWidth), this._encoding));
        return this;
    }

    /**
     * Grouping textRow to array
     * 
     * @param  {Array<String>} args array of object 
     * @return {Command}
     */
    textRows (args = []) {
        args.forEach((el) => {
            this.textRow(el.data, el.colWidth)
        });
        return this;
    }
    /**
     * Lines of characters, split horizontally to display the set of entered text
     * 
     * @param  {Array<String>} texts text collection
     * @param  {Array<String>} colWidth column width, total 32
     * @return {Command}
     */
    textRow (texts = [], colWidth = []) {
        const width = Math.floor(this._textLength / (this._state.fontSize + 1));
        let cellWidth = Math.floor(width / texts.length);

        let text = "";
        let moreRow = 0;

        texts.forEach((c, index) => {
            cellWidth = colWidth.length ? colWidth[index] : cellWidth;
            let cWidth = this._computeTextLength(c);
            let rowNum = Math.ceil(cWidth / cellWidth);
            
            rowNum = Math.ceil((rowNum * 2 + cWidth) / cellWidth) - 1;
            if (rowNum > moreRow) moreRow = rowNum;
            const { i, str } = readCountStr.call(this, c, cellWidth - 1); //Subtract 1 to preserve one character spacing
            text += str;
            cWidth = this._computeTextLength(str);
            if (cWidth < cellWidth) text += " ".repeat(cellWidth - cWidth);
            texts[index] = c.slice(i);
        });
        text += "\n";
        for (let i = 0; i < moreRow; i++) {
            texts.forEach((c, index) => {
                const { i, str } = readCountStr.call(this, c, cellWidth - 1); //Subtract 1 to preserve one character spacing
                const cWidth = this._computeTextLength(str);
                text += str;
                if (cWidth < cellWidth) text += " ".repeat(cellWidth - cWidth);
                texts[index] = c.slice(i);
            });
            text += "\n";
        }
        this._queue.push(...iconv.encode(text, this._encoding));
        return this;
        function readCountStr (text, num) {
            let length = 0, str = "", i = 0;
            for (; i < text.length; i++)  {
                length += this._computeTextLength(text[i]);
                if (length > num) return {i, str};                
                str += text[i];
            }
            return {i, str};
        }
    }

    /**
     * walk paper n lines
     * 
     * @param  {Number} 0-255 走纸行数
     * @return {Command}
     */
    newLine (num = 1) {
        for (let i = 0; i < num; i++) {
            this._queue.push(...iconv.encode("\n", this._encoding));
        }
        return this;
    }

    /**
     * Set line spacing
     * 
     * @param  {Number} height 0-255 Unit millimeters, set to default line spacing if not passed
     * @return {Command}
     */
    lineHeight (height) {
        if (height === undefined) {
            this._queue.push(...this._cmd["ESC2"]); //The instruction document says that the default value is 3.75mm
        } else {
            this._queue.push(...this._cmd["ESC3"], height);
        }
        return this;
    }

    /**
     * set font size
     * 
     * @param  {Number} size 0-7 Default to default size
     * @return {Command}
     */
    fontSize (size = 0) {
        // 0-2 bits represent height, 4-6 bits represent width; 0-7
        if (size > 7) throw "size不得大于8！";
        this._state.fontSize = size;
        const v = ((size << 4) ^ size);
        this._queue.push(...this._cmd["GS!"], v);
        return this;
    }

    /**
     * Bold font, unbold
     * 
     * @param  {Boolean} is Whether to bold, the default is false
     * @return {Command}
     */
    blob (is = false) {
        this._queue.push(...this._cmd["ESCE"], is ? 1 : 0);
        return this;
    }

    /**
     * print image GSV0
     * 
     * @param  {String|Buffer} bufOrPath Image relative address, or buffer
     * @param  {String}        type      Image type, when bufOrPath is Buffer type, it is passed
     * @return {Command}
     */
    async image (bufOrPath, type) {
        let { data, shape: [ width, height ] } = await new Promise((resolve, reject) => {
            if (Buffer.isBuffer(bufOrPath)) {
                getPixels(bufOrPath, type, (err, pixels) => {
                    if(err) {
                        reject(err);
                        return;
                    }
                    resolve(pixels);
                });
            } else {
                getPixels(bufOrPath, (err, pixels) => {
                    if(err) {
                        reject(err);
                        return;
                    }
                    resolve(pixels);
                });
            }
        });
        const pixels = [];
        Object.keys(data).forEach(k => pixels.push(data[k]));

        //turn black and white
        const binary = [];
        for (let i = 0; i < pixels.length; i += 4) {
            const pixel = {
                r: pixels[i],
                g: pixels[i + 1],
                b: pixels[i + 2],
                a: pixels[i + 3]
            }
            if (pixel.a === 0) {
                binary.push(0);
                continue;
            }
            const gray = parseInt((pixel.r + pixel.g + pixel.b) / 3);
            binary.push(gray > 170 ? 0 : 1); // If the grayscale is less than 2/3, it is judged as white, otherwise it is black
        }

        //Generate printer data
        const bytes = [];
        const xCount = Math.ceil(width / 8);
        for (let n = 0; n < height; n++) {
            for (let x = 0; x < xCount; x++) {
                let byte = 0x00;
                for (let i = 0; i < 8; i++) {
                    if (binary[n * width + x * 8 + i]) {
                        byte |= 0x80 >> i;
                    }
                }
                bytes.push(byte);
            }
        }

        this._queue.push(...this._cmd["ESA"], 1);
        this._queue.push(...this._cmd["GSV0"], 0);
        this._queue.push(xCount & 0xff, (xCount >> 8) & 0xff, height & 0xff, (height >> 8) & 0xff, ...bytes);
        this._queue.push(...this._cmd["ESA"], 0);
        return this;
    }

    /**
     * Print and print QR code (QR code picture)
     * 
     * @param  {String} code The information to be carried by the QR code
     * @param  {Number} size The size of the QR code, 5-15 is recommended, you can actually test it yourself to get the appropriate value
     * @return {Command}
     */
    async qrcode (code, size = 10) {
        const qrcodeBuf = qrimage.imageSync(code, { type: "png", size });
        await this.image(qrcodeBuf, "image/png");
        return this;
    }

    /**
     * Printing barcodes (EAN-13)
     * 
     * @param  {String} code Barcode code, a string of numbers, the length must be 12-13
     * @return {Command}
     */
    barcode (code) {
        code = String(code);
        if (code.length !== 12 || !/^[0-9]+$/.test(code)) throw "code长度固定位12位,且只能为数字！";
        this._queue.push(...this._cmd["ESA"], 1);
        this._queue.push(...this._cmd["GSH"], 2);
        this._queue.push(...this._cmd["GSK"], 2, ...Command.transformNumberToBarcode(code), 0x00);
        this._queue.push(...this._cmd["ESA"], 0);
        return this;
    }

}
Command.encoding = "GB18030";
Command.printeWidths = {
    "58mm": 32,
    "80mm": 48
};
Command.cmd = {
    "GSL":  [0x1d, 0x4c], //print left margin
    "LF":   [0x0a],       //print and feed one line
    "GSW":  [0x1d, 0x57], //Set the print area width
    "GSP":  [0x1d, 0x50], //Set the horizontal and vertical movement unit 22.5 to 1mm, this command is valid until the machine restarts
    "GS!":  [0x1d, 0x21], //set character size
    "ESCB": [0x1b, 0x42], //buzzer
    "GSV":  [0x1d, 0x56], //cut paper
    "ESC3": [0x1b, 0x33], //Set line spacing
    "ESC2": [0x1b, 0x32], //Choose default line spacing
    "ESCE": [0x1b, 0x45], //whether to bold
    "GSV0": [0x1d, 0x76, 0x30], //GSV0 print raster bitmap
    "ESA":  [0x1b, 0x61], //Set horizontal alignment to 0,1,2 l，c，r
    "GSK":  [0x1d, 0x6b], //barcode
    "GSH":  [0x1d, 0x48], //barcode code location
}
Command.transformNumberToBarcode = function (code) {
    const arr = code.split(""), result = [];
    arr.forEach(number => {
        result.push(Number(number) + 48);
    });
    return result;
}

module.exports = Command;