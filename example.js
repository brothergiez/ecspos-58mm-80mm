const Printer = require('./lib/printer.class');
const Command = require('./lib/command.class');

//searching printer id and pid
const {
  deviceDescriptor: { idVendor, idProduct }
} = Printer.findPrint();

const printer = new Printer(idVendor, idProduct);
let cmd = new Command({ printeWidth: '58mm' }); // use { printeWidth: "80mm" } for printer 80mm

const datatoPrint = [
  { data: ['Pampers', 'x1', '10.500.000'], colWidth: [14, 6, 12] }, //total colwidth for 58mm = 32, 80mm = 48
  { data: ['Milk (250g)', 'x3', '300.000'], colWidth: [14, 6, 12] },
  { data: ['Rinso', 'x1', '400.000'], colWidth: [14, 6, 12] },
  { data: ['Autan', 'x1', '20.000'], colWidth: [14, 6, 12] },
  { data: ['Empan Ikan(250g)', 'x2', '32.000'], colWidth: [14, 6, 12] }
];

async function f() {
  cmd
    .fontSize(1)
    .textCenter('Toko Aman') // must 32 char
    .newLine(1)
    .textCenter('Sejahtera') // must 32 char
    .newLine(2)
    .fontSize()
    .textCenter('Jl. Bangka 2 No 12. Jaktim')
    .fontSize()
    .newLine(2)
    .textRow(['Item', 'Qty', 'Price'], [14, 6, 12]) // if using default colwidth, give only one args .textRow(["Item", "Qty", "Price"])
    .text('='.repeat(32));
  cmd
    .textRows(datatoPrint)
    .text('='.repeat(32))
    .text('Total: 11.252.000')
    .newLine(2)
    .fontSize(1)
    .textCenter('Terima Kasih')
    .newLine(2);
  await printer.write(cmd.export());
}

!(async function () {
  await f();
  console.log('finished printing');
  printer.destroy();
})();
