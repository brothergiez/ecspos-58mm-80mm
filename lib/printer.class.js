const escpos = require('escpos');
escpos.USB = require('escpos-usb');
const printType = 0x07;
const { platform } = require("os");

class Printer {
    constructor (vid, pid) {
        this._printer = Printer.getPrinter(vid, pid);
        this._interfaceOfEp = null;
        this._ep = this._getEndpoint();
    }

    _getEndpoint () {
        this._printer.open();
        for (let itf of [...this._printer.device.interfaces]) {
            if (platform() !== "win32") {
                if (itf.isKernelDriverActive()) {
                    itf.detachKernelDriver();
                }
            }
            itf.claim();
            for (let endpoint of itf.endpoints) {
                if (endpoint.direction === "out") {
                    this._interfaceOfEp = itf;
                    return endpoint;
                }
            }
        }
        throw "No endpoints found for printer write data!";
    }

    /**
     * write data to the printer 
     * 
     * @param {Buffer} data buffer data
     */
    async write (data) {
        return new Promise((resolve, reject) => {
            this._ep.transfer(data, err => {
                if (err) return reject(err);
                resolve();
            });
        });
    }

    /**
     * destroy the printer 
     */
    async destroy () {
        await new Promise((resolve , reject) => {
            this._interfaceOfEp.release(this._ep, err => err ? reject(err) : resolve());
        });
        this._printer.close();
    }
}

/**
 * Find a printer
 * 
 * @return {Array} 
 */
Printer.findPrints = function () {
    const dvs = escpos.USB.findPrinter();
    const prints = dvs.filter(dv => {
        if (dv._configDescriptor) {
            return dv._configDescriptor.interfaces.filter(arr => {
                return ([...arr]).filter(interface => {
                    return interface.bInterfaceClass === printType;
                }).length;
            }).length;
        }
    });
    return prints;
}

/**
 *  Get the specified printer
 * 
 * @param  {String} vid printer vendor id
 * @param  {String} pid printer product id
 * @return {Object}  Printer object
 */
Printer.getPrinter = (vid, pid) => {
    const device  = new escpos.USB(vid, pid);
    return device;
}

/**
 *  Find the specified printer, if no vip or pid is specified, the first one will be returned
 * 
 * @param  {String} vid printer vendor id, optional
 * @param  {String} pid printer product id, optional
 * @return {Array}  array of printers
 */
Printer.findPrint = function (vid, pid) {
    let prints = module.exports.findPrints();
    if (prints.length === 0) throw "No printers found!";
    if (!vid && !pid) {
        return prints[0];
    }
    if (vid !== undefined) {
        prints = prints.filter(p => p.deviceDescriptor.idVendor === vid);
    }
    if (pid !== undefined) {
        prints = prints.filter(p => p.deviceDescriptor.idProduct === pid);
    }
    return prints;
}

module.exports = Printer;